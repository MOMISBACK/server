const userService = require('../services/userService');
const User = require('../models/User');
const DiamondTransaction = require('../models/DiamondTransaction');

const DAILY_CHEST_REWARD = 5;
const DAILY_CHEST_MAX_CLAIMS_PER_DAY = 3;

const normalizePartnerLinks = (partnerLinks) => {
  const links = Array.isArray(partnerLinks) ? partnerLinks : [];
  return links.map((link) => {
    const partnerDoc = link?.partnerId && link.partnerId._id ? link.partnerId : null;
    return {
      slot: link.slot,
      status: link.status,
      partnerId: partnerDoc ? partnerDoc._id.toString() : link.partnerId?.toString?.() || null,
      ...(partnerDoc
        ? {
            partner: {
              _id: partnerDoc._id.toString(),
              username: partnerDoc.username,
              email: partnerDoc.email,
              totalDiamonds: partnerDoc.totalDiamonds ?? 200,
              profilePicture: partnerDoc.profilePicture || null,
            },
          }
        : {}),
    };
  });
};

/**
 * Gets the profile of the currently logged-in user.
 * The user object is attached to the request by the 'protect' middleware.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 */
const getUserProfile = (req, res) => {
  // The user data is already fetched by the protect middleware
  res.status(200).json(req.user);
};


/**
 * Gets all users.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 */
const getUsers = async (req, res) => {
  try {
    const users = await userService.getAllUsers();
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Gets user's partner links (P1, P2 slots)
 */
const getPartnerLinks = async (req, res) => {
  try {
    const user = await userService.getUserWithPartnerLinks(req.user.id);
    res.json({
      success: true,
      data: {
        partnerLinks: normalizePartnerLinks(user.partnerLinks),
        activeSlot: user.activeSlot || 'solo',
        hasSelectedSlot: Boolean(user.hasSelectedSlot),
      },
    });
  } catch (error) {
    console.error('❌ [getPartnerLinks]:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Updates user's partner links (P1, P2)
 * Body: { p1: userId or null, p2: userId or null }
 */
const updatePartnerLinks = async (req, res) => {
  try {
    const { p1, p2 } = req.body;

    if (p1 && p1 === req.user.id.toString()) {
      return res.status(400).json({ success: false, message: 'Vous ne pouvez pas être votre propre partenaire' });
    }
    if (p2 && p2 === req.user.id.toString()) {
      return res.status(400).json({ success: false, message: 'Vous ne pouvez pas être votre propre partenaire' });
    }

    const user = await userService.updateUserPartnerLinks(req.user.id, { p1, p2 });

    res.json({
      success: true,
      data: {
        partnerLinks: normalizePartnerLinks(user.partnerLinks),
        activeSlot: user.activeSlot || 'solo',
        hasSelectedSlot: Boolean(user.hasSelectedSlot),
      },
    });
  } catch (error) {
    console.error('❌ [updatePartnerLinks]:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Updates active slot (p1, p2, solo)
 * Body: { activeSlot: 'p1' | 'p2' | 'solo' }
 */
const updateActiveSlot = async (req, res) => {
  try {
    const { activeSlot } = req.body;

    if (!['p1', 'p2', 'solo'].includes(activeSlot)) {
      return res.status(400).json({ success: false, message: 'Slot invalide' });
    }

    const user = await userService.updateUserActiveSlot(req.user.id, activeSlot);

    res.json({
      success: true,
      data: {
        partnerLinks: normalizePartnerLinks(user.partnerLinks),
        activeSlot: user.activeSlot || 'solo',
        hasSelectedSlot: Boolean(user.hasSelectedSlot),
      },
    });
  } catch (error) {
    console.error('❌ [updateActiveSlot]:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Set or update the current user's username.
 * Body: { username: string }
 */
const updateUsername = async (req, res) => {
  try {
    const raw = req.body?.username;
    if (typeof raw !== 'string' || !raw.trim()) {
      return res.status(400).json({ success: false, message: 'Pseudo requis' });
    }

    const username = raw.trim().toLowerCase();

    if (username.length < 3 || username.length > 20 || !/^[a-z0-9_]+$/.test(username)) {
      return res.status(400).json({
        success: false,
        message: 'Pseudo invalide (3-20 caractères, lettres/chiffres/_)',
      });
    }

    const existing = await User.findOne({ username, _id: { $ne: req.user.id } }).select('_id');
    if (existing) {
      return res.status(400).json({ success: false, message: 'Username already taken' });
    }

    const updated = await User.findByIdAndUpdate(
      req.user.id,
      { username },
      { new: true, runValidators: true },
    ).select('-password');

    return res.json({ success: true, data: { user: updated } });
  } catch (error) {
    // Duplication username (index unique)
    if (error?.code === 11000) {
      return res.status(400).json({ success: false, message: 'Username already taken' });
    }
    console.error('❌ [updateUsername]:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getHealthStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('health');
    return res.json({
      success: true,
      data: {
        health: user?.health || {},
      },
    });
  } catch (error) {
    console.error('❌ [getHealthStatus]:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

const updateHealthStatus = async (req, res) => {
  try {
    const provider = req.body?.provider;
    const validProviders = ['appleHealth', 'healthConnect', 'strava'];
    
    if (!validProviders.includes(provider)) {
      return res.status(400).json({ success: false, message: 'Provider invalide' });
    }

    // Strava is handled separately via /api/strava routes (OAuth flow)
    if (provider === 'strava') {
      return res.status(400).json({ 
        success: false, 
        message: 'Strava doit être connecté via /api/strava/auth' 
      });
    }

    const linked = req.body?.linked;
    const autoImport = req.body?.autoImport;
    const permissions = req.body?.permissions;
    const lastSyncAt = req.body?.lastSyncAt;

    const update = {};
    
    // If linking a new provider, set it as active and unlink others
    if (linked === true) {
      update['health.activeProvider'] = provider;
      
      // Unlink other providers
      for (const p of validProviders) {
        if (p !== provider && p !== 'strava') {
          update[`health.${p}.linked`] = false;
          update[`health.${p}.autoImport`] = false;
        }
      }
      // Also unlink Strava if it was active
      update['health.strava.linked'] = false;
      update['health.strava.autoImport'] = false;
    }
    
    // If unlinking the active provider, clear activeProvider
    if (linked === false) {
      const user = await User.findById(req.user.id).select('health.activeProvider');
      if (user?.health?.activeProvider === provider) {
        update['health.activeProvider'] = null;
      }
    }
    
    if (typeof linked === 'boolean') update[`health.${provider}.linked`] = linked;
    if (typeof autoImport === 'boolean') update[`health.${provider}.autoImport`] = autoImport;
    if (Array.isArray(permissions)) update[`health.${provider}.permissions`] = permissions.map(String);
    if (typeof lastSyncAt === 'string' || lastSyncAt instanceof Date) {
      const parsed = new Date(lastSyncAt);
      if (!Number.isNaN(parsed.getTime())) {
        update[`health.${provider}.lastSyncAt`] = parsed;
      }
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ success: false, message: 'Aucune donnée à mettre à jour' });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: update },
      { new: true, runValidators: true },
    ).select('health');

    return res.json({
      success: true,
      data: {
        health: user?.health || {},
      },
    });
  } catch (error) {
    console.error('❌ [updateHealthStatus]:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// POST /api/users/daily-chest
// Claim the daily chest reward (up to 3 times per UTC day)
const claimDailyChest = async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const today = now.toISOString().slice(0, 10); // UTC YYYY-MM-DD

    // Concurrency-safe claim:
    // - if new day: reset counter to 1
    // - else increment counter
    // - reject if already claimed 3 times today
    const result = await User.updateOne(
      {
        _id: userId,
        $or: [
          { dailyChestClaimDate: { $ne: today } },
          { dailyChestClaimDate: { $exists: false } },
          { dailyChestClaimDate: null },
          { dailyChestClaimDate: today, dailyChestClaimsToday: { $lt: DAILY_CHEST_MAX_CLAIMS_PER_DAY } },
        ],
      },
      [
        {
          $set: {
            dailyChestClaimDate: {
              $cond: [{ $eq: ['$dailyChestClaimDate', today] }, '$dailyChestClaimDate', today],
            },
            dailyChestClaimsToday: {
              $cond: [
                { $eq: ['$dailyChestClaimDate', today] },
                { $add: ['$dailyChestClaimsToday', 1] },
                1,
              ],
            },
            dailyChestLastOpenedAt: now,
          },
        },
        {
          $set: {
            totalDiamonds: { $add: ['$totalDiamonds', DAILY_CHEST_REWARD] },
          },
        },
      ],
      { updatePipeline: true }
    );

    if (result.modifiedCount !== 1) {
      const current = await User.findById(userId).select('dailyChestClaimDate dailyChestClaimsToday');
      const claimsDate = current?.dailyChestClaimDate || today;
      const claimsToday = claimsDate === today ? Number(current?.dailyChestClaimsToday || 0) : 0;
      const claimsRemaining = Math.max(0, DAILY_CHEST_MAX_CLAIMS_PER_DAY - claimsToday);

      return res.status(429).json({
        success: false,
        message: `Cadeau déjà récupéré ${DAILY_CHEST_MAX_CLAIMS_PER_DAY} fois aujourd’hui.`,
        data: {
          dailyChestClaimDate: today,
          dailyChestClaimsToday: claimsToday,
          claimsRemaining,
        },
      });
    }

    // Best-effort ledger
    await DiamondTransaction.create({
      user: userId,
      amount: DAILY_CHEST_REWARD,
      kind: 'daily_chest',
      refModel: 'User',
      refId: userId,
      note: 'Daily chest reward',
    }).catch(() => undefined);

    const updated = await User.findById(userId).select('totalDiamonds dailyChestLastOpenedAt dailyChestClaimDate dailyChestClaimsToday');
    const claimsDate = updated?.dailyChestClaimDate || today;
    const claimsToday = claimsDate === today ? Number(updated?.dailyChestClaimsToday || 0) : 0;
    const claimsRemaining = Math.max(0, DAILY_CHEST_MAX_CLAIMS_PER_DAY - claimsToday);

    return res.json({
      success: true,
      data: {
        reward: DAILY_CHEST_REWARD,
        totalDiamonds: updated?.totalDiamonds,
        dailyChestLastOpenedAt: (updated?.dailyChestLastOpenedAt ? new Date(updated.dailyChestLastOpenedAt) : now).toISOString(),
        dailyChestClaimDate: today,
        dailyChestClaimsToday: claimsToday,
        claimsRemaining,
      },
    });
  } catch (error) {
    console.error('❌ [claimDailyChest]:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = {
  getUserProfile,
  getUsers,
  getPartnerLinks,
  updatePartnerLinks,
  updateActiveSlot,
  updateUsername,
  getHealthStatus,
  updateHealthStatus,
  claimDailyChest,
  sendPartnerInvite: async (req, res) => {
    try {
      const { partnerId, slot } = req.body;
      const invite = await userService.sendPartnerInvite({
        fromUserId: req.user.id,
        toUserId: partnerId,
        slot,
      });

      res.json({
        success: true,
        data: {
          invite,
        },
      });
    } catch (error) {
      console.error('❌ [sendPartnerInvite]:', error);
      res.status(400).json({ success: false, message: error.message });
    }
  },

  getIncomingPartnerInvites: async (req, res) => {
    try {
      const invites = await userService.getIncomingPartnerInvites({ userId: req.user.id });
      res.json({ success: true, data: { invites } });
    } catch (error) {
      console.error('❌ [getIncomingPartnerInvites]:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  acceptPartnerInvite: async (req, res) => {
    try {
      const { inviteId } = req.params;
      const invite = await userService.acceptPartnerInvite({ inviteId, userId: req.user.id });
      res.json({ success: true, data: { invite } });
    } catch (error) {
      console.error('❌ [acceptPartnerInvite]:', error);
      res.status(400).json({ success: false, message: error.message });
    }
  },

  refusePartnerInvite: async (req, res) => {
    try {
      const { inviteId } = req.params;
      const invite = await userService.refusePartnerInvite({ inviteId, userId: req.user.id });
      res.json({ success: true, data: { invite } });
    } catch (error) {
      console.error('❌ [refusePartnerInvite]:', error);
      res.status(400).json({ success: false, message: error.message });
    }
  },

  // ✅ Push notification token management
  updatePushToken: async (req, res) => {
    try {
      const { pushToken } = req.body;
      
      if (!pushToken || typeof pushToken !== 'string') {
        return res.status(400).json({ success: false, message: 'Push token requis' });
      }

      await User.findByIdAndUpdate(req.user.id, { pushToken });
      
      res.json({ success: true, message: 'Token enregistré' });
    } catch (error) {
      console.error('❌ [updatePushToken]:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  deletePushToken: async (req, res) => {
    try {
      await User.findByIdAndUpdate(req.user.id, { pushToken: null });
      res.json({ success: true, message: 'Token supprimé' });
    } catch (error) {
      console.error('❌ [deletePushToken]:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // ✅ Notification preferences management
  getNotificationPreferences: async (req, res) => {
    try {
      const user = await User.findById(req.user.id).select('notificationPreferences pushToken');
      res.json({ 
        success: true, 
        data: {
          preferences: user.notificationPreferences || {
            dailyReminder: true,
            challengeUpdates: true,
            partnerActivity: true,
            dailyReminderHour: 9,
          },
          hasPushToken: Boolean(user.pushToken),
        }
      });
    } catch (error) {
      console.error('❌ [getNotificationPreferences]:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  updateNotificationPreferences: async (req, res) => {
    try {
      const { dailyReminder, challengeUpdates, partnerActivity, dailyReminderHour } = req.body;
      
      const updates = {};
      if (typeof dailyReminder === 'boolean') {
        updates['notificationPreferences.dailyReminder'] = dailyReminder;
      }
      if (typeof challengeUpdates === 'boolean') {
        updates['notificationPreferences.challengeUpdates'] = challengeUpdates;
      }
      if (typeof partnerActivity === 'boolean') {
        updates['notificationPreferences.partnerActivity'] = partnerActivity;
      }
      if (typeof dailyReminderHour === 'number' && dailyReminderHour >= 0 && dailyReminderHour <= 23) {
        updates['notificationPreferences.dailyReminderHour'] = dailyReminderHour;
      }

      const user = await User.findByIdAndUpdate(
        req.user.id, 
        { $set: updates },
        { new: true }
      ).select('notificationPreferences');

      res.json({ success: true, data: { preferences: user.notificationPreferences } });
    } catch (error) {
      console.error('❌ [updateNotificationPreferences]:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },
};
