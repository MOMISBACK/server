const { validationResult } = require('express-validator');
const activityService = require('../services/activityService');

/**
 * Handles getting all activities for the logged-in user.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 */
const getUserActivities = async (req, res) => {
  try {
    const activities = await activityService.getActivitiesByUser(req.user.id);
    res.json(activities);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server Error');
  }
};

/**
 * Handles the creation of a new activity.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 */
const addUserActivity = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { title, type, duration, distance, calories, date } = req.body;

  try {
    const activityData = { title, type, duration, distance, calories, date };
    const activity = await activityService.createActivity(activityData, req.user.id);
    res.json(activity);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server Error');
  }
};

/**
 * Handles the deletion of an activity.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 */
const deleteUserActivity = async (req, res) => {
  try {
    const activity = await activityService.findActivityById(req.params.id);

    if (!activity) {
      return res.status(404).json({ msg: 'Activity not found' });
    }

    // Make sure user owns the activity
    if (activity.user.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'Not authorized' });
    }

    await activityService.deleteActivityById(req.params.id);

    res.json({ msg: 'Activity removed' });
  } catch (error) {
    console.error(error.message);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Activity not found' });
    }
    res.status(500).send('Server Error');
  }
};

module.exports = {
  getUserActivities,
  addUserActivity,
  deleteUserActivity,
};
