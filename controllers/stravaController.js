/**
 * Strava Controller
 * Handles OAuth flow and activity import from Strava
 */

const crypto = require('crypto');
const User = require('../models/User');
const Activity = require('../models/Activity');
const stravaConfig = require('../config/strava');
const stravaService = require('../services/stravaService');

// Temporary state storage (in production, use Redis or similar)
// Format: { state: { userId, createdAt } }
const pendingStates = new Map();
const STATE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

// Clean up expired states periodically
setInterval(() => {
  const now = Date.now();
  for (const [state, data] of pendingStates.entries()) {
    if (now - data.createdAt > STATE_EXPIRY_MS) {
      pendingStates.delete(state);
    }
  }
}, 60 * 1000); // Every minute

/**
 * GET /api/strava/auth
 * Initiates OAuth flow - returns URL to redirect user to
 */
const initiateAuth = async (req, res) => {
  try {
    if (!stravaConfig.isConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Strava integration not configured',
      });
    }

    // Generate CSRF state token
    const state = crypto.randomBytes(32).toString('hex');
    
    // Store state with user ID for callback validation
    pendingStates.set(state, {
      userId: req.user.id,
      createdAt: Date.now(),
    });

    const authUrl = stravaConfig.getAuthorizationUrl(state);

    res.json({
      success: true,
      data: {
        authUrl,
        state, // Client may need this for deep linking
      },
    });
  } catch (error) {
    console.error('❌ [Strava] initiateAuth error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/strava/callback
 * OAuth callback - exchanges code for tokens
 * Can be called directly (web) or via deep link (mobile)
 */
const handleCallback = async (req, res) => {
  try {
    const { code, state, error: oauthError } = req.query;

    // Handle OAuth errors
    if (oauthError) {
      console.warn('[Strava] OAuth error:', oauthError);
      return res.redirect(`mmp3://strava-callback?error=${encodeURIComponent(oauthError)}`);
    }

    if (!code || !state) {
      return res.status(400).json({
        success: false,
        message: 'Missing code or state parameter',
      });
    }

    // Validate state
    const stateData = pendingStates.get(state);
    if (!stateData) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired state. Please try connecting again.',
      });
    }

    // Clean up used state
    pendingStates.delete(state);

    // Exchange code for tokens
    const tokens = await stravaService.exchangeCodeForTokens(code);

    // Find and update user
    const user = await User.findById(stateData.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Unlink previous provider if different
    if (user.health?.activeProvider && user.health.activeProvider !== 'strava') {
      const prevProvider = user.health.activeProvider;
      if (user.health[prevProvider]) {
        user.health[prevProvider].linked = false;
        user.health[prevProvider].autoImport = false;
      }
    }

    // Update Strava link
    user.health = user.health || {};
    user.health.strava = {
      linked: true,
      autoImport: true,
      athleteId: String(tokens.athlete.id),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: tokens.expiresAt,
      scope: tokens.scope,
    };
    user.health.activeProvider = 'strava';

    await user.save();

    console.log(`✅ [Strava] User ${user._id} connected (athlete: ${tokens.athlete.id})`);

    // Return HTML page that redirects to the app
    // This works better than a direct redirect on Android Chrome
    const deepLink = `mmp3://strava-callback?success=true&athleteId=${tokens.athlete.id}`;
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Connexion Strava réussie</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%);
      color: white;
      text-align: center;
      padding: 20px;
    }
    .success-icon { font-size: 64px; margin-bottom: 20px; }
    h1 { margin: 0 0 10px 0; font-size: 24px; }
    p { margin: 0 0 30px 0; opacity: 0.8; }
    .btn {
      background: #FC4C02;
      color: white;
      border: none;
      padding: 16px 32px;
      font-size: 18px;
      font-weight: bold;
      border-radius: 12px;
      cursor: pointer;
      text-decoration: none;
      display: inline-block;
    }
    .hint { margin-top: 20px; font-size: 12px; opacity: 0.6; }
  </style>
</head>
<body>
  <div class="success-icon">✅</div>
  <h1>Strava connecté !</h1>
  <p>Tu peux retourner à l'application.</p>
  <a href="${deepLink}" class="btn">Ouvrir Match My Pace</a>
  <p class="hint">Si le bouton ne fonctionne pas, ferme cette page manuellement.</p>
  <script>
    // Try to redirect automatically
    setTimeout(function() {
      window.location.href = "${deepLink}";
    }, 500);
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    console.error('❌ [Strava] callback error:', error);
    
    // Return error HTML page
    const deepLink = `mmp3://strava-callback?error=${encodeURIComponent(error.message)}`;
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Erreur Strava</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #1a1a2e;
      color: white;
      text-align: center;
      padding: 20px;
    }
    .error-icon { font-size: 64px; margin-bottom: 20px; }
    h1 { margin: 0 0 10px 0; font-size: 24px; color: #ff6b6b; }
    p { margin: 0 0 30px 0; opacity: 0.8; }
    .btn {
      background: #333;
      color: white;
      border: none;
      padding: 16px 32px;
      font-size: 18px;
      border-radius: 12px;
      cursor: pointer;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="error-icon">❌</div>
  <h1>Erreur de connexion</h1>
  <p>${error.message}</p>
  <a href="${deepLink}" class="btn">Retour à l'app</a>
  <script>
    setTimeout(function() {
      window.location.href = "${deepLink}";
    }, 1000);
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  }
};

/**
 * POST /api/strava/callback-code
 * Alternative callback for mobile apps that capture the code themselves
 * Body: { code: string, state: string }
 */
const handleCallbackCode = async (req, res) => {
  try {
    const { code, state } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Missing authorization code',
      });
    }

    // For mobile flow, we may not have state - use authenticated user
    let userId = req.user?.id;
    
    if (state) {
      const stateData = pendingStates.get(state);
      if (stateData) {
        userId = stateData.userId;
        pendingStates.delete(state);
      }
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    // Exchange code for tokens
    const tokens = await stravaService.exchangeCodeForTokens(code);

    // Find and update user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Unlink previous provider
    if (user.health?.activeProvider && user.health.activeProvider !== 'strava') {
      const prevProvider = user.health.activeProvider;
      if (user.health[prevProvider]) {
        user.health[prevProvider].linked = false;
        user.health[prevProvider].autoImport = false;
      }
    }

    // Update Strava link
    user.health = user.health || {};
    user.health.strava = {
      linked: true,
      autoImport: true,
      athleteId: String(tokens.athlete.id),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: tokens.expiresAt,
      scope: tokens.scope,
    };
    user.health.activeProvider = 'strava';

    await user.save();

    console.log(`✅ [Strava] User ${user._id} connected via mobile flow`);

    res.json({
      success: true,
      data: {
        linked: true,
        athleteId: tokens.athlete.id,
        athleteName: `${tokens.athlete.firstname} ${tokens.athlete.lastname}`,
      },
    });
  } catch (error) {
    console.error('❌ [Strava] callback-code error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/strava/sync
 * Import activities from Strava
 * Body: { after?: Date, before?: Date }
 */
const syncActivities = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user?.health?.strava?.linked) {
      return res.status(400).json({
        success: false,
        message: 'Strava non connecté',
      });
    }

    // Get valid access token (auto-refresh if needed)
    const accessToken = await stravaService.getValidAccessToken(user);

    // Determine time range
    const body = req.body || {};
    const lastSync = user.health.strava.lastSyncAt;
    const after = body.after 
      ? new Date(body.after) 
      : lastSync 
        ? new Date(lastSync) 
        : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Default: last 7 days
    
    const before = body.before ? new Date(body.before) : new Date();

    console.log(`[Strava] Syncing activities for user ${user._id} from ${after.toISOString()} to ${before.toISOString()}`);

    // Fetch activities from Strava
    const stravaActivities = await stravaService.fetchActivities(accessToken, {
      after,
      before,
      perPage: 100,
    });

    if (!stravaActivities.length) {
      // Update lastSyncAt even if no activities
      user.health.strava.lastSyncAt = new Date();
      await user.save();

      return res.json({
        success: true,
        data: {
          imported: 0,
          skipped: 0,
          message: 'Aucune nouvelle activité',
        },
      });
    }

    let imported = 0;
    let skipped = 0;
    const errors = [];

    for (const stravaActivity of stravaActivities) {
      try {
        // Check for duplicate
        const existingActivity = await Activity.findOne({
          user: user._id,
          externalSource: 'strava',
          externalId: String(stravaActivity.id),
        });

        if (existingActivity) {
          skipped++;
          continue;
        }

        // Convert and save
        const mmp3Activity = stravaService.convertToMmp3Activity(stravaActivity, user._id);
        await Activity.create(mmp3Activity);
        imported++;
      } catch (err) {
        console.warn(`[Strava] Failed to import activity ${stravaActivity.id}:`, err.message);
        errors.push({ id: stravaActivity.id, error: err.message });
      }
    }

    // Update last sync time
    user.health.strava.lastSyncAt = new Date();
    await user.save();

    console.log(`✅ [Strava] Sync complete: ${imported} imported, ${skipped} skipped`);

    res.json({
      success: true,
      data: {
        imported,
        skipped,
        errors: errors.length > 0 ? errors : undefined,
        lastSyncAt: user.health.strava.lastSyncAt,
      },
    });
  } catch (error) {
    console.error('❌ [Strava] sync error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/strava/status
 * Get current Strava connection status
 */
const getStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const strava = user?.health?.strava;

    if (!strava?.linked) {
      return res.json({
        success: true,
        data: {
          linked: false,
          isConfigured: stravaConfig.isConfigured(),
        },
      });
    }

    res.json({
      success: true,
      data: {
        linked: true,
        autoImport: strava.autoImport,
        athleteId: strava.athleteId,
        lastSyncAt: strava.lastSyncAt,
        tokenExpiresAt: strava.tokenExpiresAt,
        isActiveProvider: user.health.activeProvider === 'strava',
      },
    });
  } catch (error) {
    console.error('❌ [Strava] status error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * DELETE /api/strava/disconnect
 * Disconnect Strava integration
 */
const disconnect = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user?.health?.strava?.linked) {
      return res.json({
        success: true,
        message: 'Strava was not connected',
      });
    }

    // Try to deauthorize on Strava side (best effort)
    try {
      if (user.health.strava.accessToken) {
        await stravaService.deauthorize(user.health.strava.accessToken);
      }
    } catch (err) {
      console.warn('[Strava] Deauthorization failed (non-blocking):', err.message);
    }

    // Clear Strava data
    user.health.strava = {
      linked: false,
      autoImport: false,
      athleteId: undefined,
      accessToken: undefined,
      refreshToken: undefined,
      tokenExpiresAt: undefined,
      scope: undefined,
      lastSyncAt: user.health.strava.lastSyncAt, // Keep for reference
    };

    // Clear active provider if it was Strava
    if (user.health.activeProvider === 'strava') {
      user.health.activeProvider = null;
    }

    await user.save();

    console.log(`✅ [Strava] User ${user._id} disconnected`);

    res.json({
      success: true,
      message: 'Strava déconnecté',
    });
  } catch (error) {
    console.error('❌ [Strava] disconnect error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  initiateAuth,
  handleCallback,
  handleCallbackCode,
  syncActivities,
  getStatus,
  disconnect,
};
