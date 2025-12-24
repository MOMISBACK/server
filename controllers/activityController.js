const activityService = require('../services/activityService');
const asyncHandler = require('../middleware/asyncHandler');
const { NotFoundError, ForbiddenError } = require('../utils/errors');
const WeeklyChallenge = require('../models/WeeklyChallenge');
const Activity = require('../models/Activity');

/**
 * Creates a new activity.
 */
const createActivity = asyncHandler(async (req, res) => {
  // Le body est directement passé au service. Le schéma Mongoose nettoie les champs superflus.
  const activityData = {
    ...req.body,
    user: req.user.id,
  };

  const activity = await activityService.createActivity(activityData);
  res.status(201).json(activity);
});

/**
 * Gets all activities for the logged-in user, with optional filtering by type.
 */
const getActivities = asyncHandler(async (req, res) => {
  const { type } = req.query;
  const query = { user: req.user.id };

  if (type) {
    query.type = type;
  }

  const activities = await activityService.getActivities(query);
  res.status(200).json(activities);
});

/**
 * Gets activities that are counted for the current active DUO challenge.
 * Returns activities from BOTH players, filtered by challenge date range and activityTypes.
 */
const getCurrentDuoChallengeActivities = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const challenge = await WeeklyChallenge.findOne({
    mode: 'duo',
    status: 'active',
    'players.user': userId,
    endDate: { $gt: new Date() },
  })
    .populate('players.user', 'username email')
    .sort({ createdAt: -1 });

  if (!challenge) {
    return res.status(200).json([]);
  }

  const playerIds = (challenge.players || [])
    .map((p) => (typeof p.user === 'string' ? p.user : p.user?._id))
    .filter(Boolean);

  // Normaliser les dates comme dans calculateProgress
  const startDateNormalized = new Date(challenge.startDate);
  startDateNormalized.setHours(0, 0, 0, 0);
  const endDateNormalized = new Date(challenge.endDate);
  endDateNormalized.setHours(23, 59, 59, 999);

  const activities = await Activity.find({
    user: { $in: playerIds },
    date: { $gte: startDateNormalized, $lte: endDateNormalized },
    createdAt: { $gte: startDateNormalized > challenge.createdAt ? startDateNormalized : challenge.createdAt },
    type: { $in: challenge.activityTypes },
  })
    .populate('user', 'username email')
    .sort({ date: -1, startTime: -1, createdAt: -1 });

  res.status(200).json(activities);
});

/**
 * Gets shared activities between the logged-in user and a selected partner.
 * This is used for the partner-slot combined history (outside challenge scope).
 */
const getSharedActivitiesWithPartner = asyncHandler(async (req, res) => {
  const userId = req.user.id.toString();
  const { partnerId } = req.params;

  if (!partnerId) {
    return res.status(400).json({ message: 'partnerId requis' });
  }

  // Security: only allow access if partnerId is configured in user's confirmed partner links
  const links = Array.isArray(req.user.partnerLinks) ? req.user.partnerLinks : [];
  const isAllowed = links.some(
    (l) =>
      l?.status === 'confirmed' &&
      l?.partnerId &&
      l.partnerId.toString() === partnerId.toString(),
  );

  if (!isAllowed) {
    return res.status(403).json({ message: 'Accès refusé à ce partenaire' });
  }

  const activities = await Activity.find({
    user: { $in: [userId, partnerId] },
  })
    .populate('user', 'username email')
    .sort({ date: -1, startTime: -1, createdAt: -1 });

  res.status(200).json(activities);
});

/**
 * Gets a single activity by its ID.
 */
const getActivityById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const activity = await activityService.getActivityById(id);

  if (!activity) {
    throw new NotFoundError('Activité');
  }

  // Check if the activity belongs to the user
  if (activity.user.toString() !== req.user.id) {
    throw new ForbiddenError("Vous n'êtes pas autorisé à accéder à cette activité");
  }

  res.status(200).json(activity);
});

/**
 * Deletes an activity by its ID.
 */
const deleteActivity = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const activity = await activityService.getActivityById(id);

  if (!activity) {
    throw new NotFoundError('Activité');
  }

  if (activity.user.toString() !== req.user.id) {
    throw new ForbiddenError("Vous n'êtes pas autorisé à supprimer cette activité");
  }

  await activityService.deleteActivityById(id);
  res.status(200).json({ message: 'Activité supprimée avec succès' });
});

/**
 * Sets (or clears) a reaction on an activity.
 * Body: { reaction: 'like' | 'love' | 'fire' | null }
 * Allowed: activity owner OR confirmed partner of the owner.
 */
const setActivityReaction = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reaction } = req.body || {};

  const allowed = ['like', 'love', 'fire'];
  const isClear = reaction === null || reaction === undefined || reaction === '';
  if (!isClear && !allowed.includes(reaction)) {
    return res.status(400).json({ message: 'Réaction invalide' });
  }

  const activity = await Activity.findById(id).populate('user', '_id');
  if (!activity) throw new NotFoundError('Activité');

  const me = req.user.id.toString();
  const ownerId = (activity.user && typeof activity.user === 'object' ? activity.user._id : activity.user).toString();

  const links = Array.isArray(req.user.partnerLinks) ? req.user.partnerLinks : [];
  const isConfirmedPartner = links.some(
    (l) => l?.status === 'confirmed' && l?.partnerId && l.partnerId.toString() === ownerId,
  );
  const isOwner = ownerId === me;

  if (!isOwner && !isConfirmedPartner) {
    throw new ForbiddenError("Vous n'êtes pas autorisé à réagir à cette activité");
  }

  if (!activity.reactions) activity.reactions = new Map();

  if (isClear) {
    activity.reactions.delete(me);
  } else {
    activity.reactions.set(me, reaction);
  }

  await activity.save();
  const refreshed = await Activity.findById(id).populate('user', 'username email');
  res.status(200).json(refreshed);
});

module.exports = {
  createActivity,
  getActivities,
  getCurrentDuoChallengeActivities,
  getSharedActivitiesWithPartner,
  getActivityById,
  setActivityReaction,
  deleteActivity,
};
