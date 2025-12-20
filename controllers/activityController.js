const activityService = require('../services/activityService');
const asyncHandler = require('../middleware/asyncHandler');
const { NotFoundError, ForbiddenError } = require('../utils/errors');

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

module.exports = {
  createActivity,
  getActivities,
  getActivityById,
  deleteActivity,
};
