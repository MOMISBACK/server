/**
 * Strava Service
 * Handles OAuth token exchange, refresh, and API calls to Strava
 */

const stravaConfig = require('../config/strava');

const STRAVA_API_BASE = stravaConfig.apiBaseUrl;

/**
 * Exchange authorization code for access/refresh tokens
 * @param {string} code - Authorization code from OAuth callback
 * @returns {Promise<{accessToken, refreshToken, expiresAt, athlete}>}
 */
async function exchangeCodeForTokens(code) {
  const response = await fetch(stravaConfig.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: stravaConfig.clientId,
      client_secret: stravaConfig.clientSecret,
      code: code,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Strava token exchange failed: ${response.status}`);
  }

  const data = await response.json();
  
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(data.expires_at * 1000), // Strava returns Unix timestamp
    athlete: data.athlete, // Contains id, firstname, lastname, etc.
    scope: data.scope || stravaConfig.scopes.join(','),
  };
}

/**
 * Refresh an expired access token
 * @param {string} refreshToken - The refresh token
 * @returns {Promise<{accessToken, refreshToken, expiresAt}>}
 */
async function refreshAccessToken(refreshToken) {
  const response = await fetch(stravaConfig.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: stravaConfig.clientId,
      client_secret: stravaConfig.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Strava token refresh failed: ${response.status}`);
  }

  const data = await response.json();
  
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token, // Strava may return a new refresh token
    expiresAt: new Date(data.expires_at * 1000),
  };
}

/**
 * Check if token needs refresh and refresh if necessary
 * @param {object} user - User document with health.strava tokens
 * @returns {Promise<string>} Valid access token
 */
async function getValidAccessToken(user) {
  const strava = user.health?.strava;
  if (!strava?.accessToken || !strava?.refreshToken) {
    throw new Error('Strava non connecté');
  }

  const now = Date.now();
  const expiresAt = new Date(strava.tokenExpiresAt).getTime();
  const buffer = stravaConfig.tokenRefreshBuffer;

  // Token still valid (with buffer)
  if (expiresAt - now > buffer) {
    return strava.accessToken;
  }

  // Need to refresh
  console.log('[Strava] Refreshing expired token for user', user._id);
  const newTokens = await refreshAccessToken(strava.refreshToken);

  // Update user document
  user.health.strava.accessToken = newTokens.accessToken;
  user.health.strava.refreshToken = newTokens.refreshToken;
  user.health.strava.tokenExpiresAt = newTokens.expiresAt;
  await user.save();

  return newTokens.accessToken;
}

/**
 * Fetch activities from Strava API
 * @param {string} accessToken - Valid access token
 * @param {object} options - Query options
 * @param {Date} options.after - Only activities after this date
 * @param {Date} options.before - Only activities before this date
 * @param {number} options.page - Page number (default 1)
 * @param {number} options.perPage - Results per page (default 30, max 200)
 * @returns {Promise<Array>} Array of Strava activities
 */
async function fetchActivities(accessToken, options = {}) {
  const params = new URLSearchParams();
  
  if (options.after) {
    params.set('after', Math.floor(new Date(options.after).getTime() / 1000));
  }
  if (options.before) {
    params.set('before', Math.floor(new Date(options.before).getTime() / 1000));
  }
  params.set('page', options.page || 1);
  params.set('per_page', Math.min(options.perPage || 30, 200));

  const url = `${STRAVA_API_BASE}/athlete/activities?${params.toString()}`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('[STRAVA_TOKEN_EXPIRED] Token invalide ou expiré');
    }
    if (response.status === 429) {
      throw new Error('[STRAVA_RATE_LIMIT] Limite de requêtes Strava atteinte');
    }
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Strava API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Fetch a single activity with detailed data (streams, etc.)
 * @param {string} accessToken - Valid access token
 * @param {string} activityId - Strava activity ID
 * @returns {Promise<object>} Detailed activity
 */
async function fetchActivityDetail(accessToken, activityId) {
  const url = `${STRAVA_API_BASE}/activities/${activityId}`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch activity ${activityId}: ${response.status}`);
  }

  return response.json();
}

/**
 * Get the authenticated athlete's profile
 * @param {string} accessToken - Valid access token
 * @returns {Promise<object>} Athlete profile
 */
async function getAthlete(accessToken) {
  const url = `${STRAVA_API_BASE}/athlete`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch athlete: ${response.status}`);
  }

  return response.json();
}

/**
 * Deauthorize the app (revoke access)
 * @param {string} accessToken - Valid access token
 * @returns {Promise<void>}
 */
async function deauthorize(accessToken) {
  const response = await fetch('https://www.strava.com/oauth/deauthorize', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    console.warn('[Strava] Deauthorization failed:', response.status);
  }
}

/**
 * Map Strava activity type to MMP3 activity type
 * @param {string} stravaType - Strava activity type
 * @returns {string} MMP3 activity type
 */
function mapActivityType(stravaType) {
  return stravaConfig.activityTypeMap[stravaType] || 'workout';
}

/**
 * Convert Strava activity to MMP3 activity format
 * @param {object} stravaActivity - Raw Strava activity
 * @param {string} userId - MMP3 user ID
 * @returns {object} Activity ready for MMP3 database
 */
function convertToMmp3Activity(stravaActivity, userId) {
  const type = mapActivityType(stravaActivity.type);
  
  // Strava distances are in meters, we use km
  const distanceKm = stravaActivity.distance ? stravaActivity.distance / 1000 : undefined;
  
  // Strava moving_time is in seconds, we use minutes
  const durationMinutes = stravaActivity.moving_time 
    ? Math.round(stravaActivity.moving_time / 60) 
    : Math.round(stravaActivity.elapsed_time / 60);
  
  // Strava average_speed is m/s, we use km/h
  const avgSpeedKmh = stravaActivity.average_speed 
    ? stravaActivity.average_speed * 3.6 
    : undefined;

  return {
    user: userId,
    title: stravaActivity.name || `${stravaActivity.type} activity`,
    type,
    date: new Date(stravaActivity.start_date),
    startTime: new Date(stravaActivity.start_date),
    endTime: stravaActivity.elapsed_time 
      ? new Date(new Date(stravaActivity.start_date).getTime() + stravaActivity.elapsed_time * 1000)
      : undefined,
    duration: durationMinutes,
    distance: distanceKm,
    avgSpeed: avgSpeedKmh,
    elevationGain: stravaActivity.total_elevation_gain, // Already in meters
    calories: stravaActivity.kilojoules 
      ? Math.round(stravaActivity.kilojoules * 0.239) // Convert kJ to kcal
      : undefined,
    heartRateAvg: stravaActivity.average_heartrate,
    heartRateMax: stravaActivity.max_heartrate,
    source: 'tracked',
    externalSource: 'strava',
    externalId: String(stravaActivity.id),
    importNotes: `Imported from Strava: ${stravaActivity.type}`,
  };
}

module.exports = {
  exchangeCodeForTokens,
  refreshAccessToken,
  getValidAccessToken,
  fetchActivities,
  fetchActivityDetail,
  getAthlete,
  deauthorize,
  mapActivityType,
  convertToMmp3Activity,
};
