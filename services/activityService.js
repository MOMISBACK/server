const Activity = require('../models/Activity');

/**
 * Gets all activities for a specific user.
 * @param {string} userId - The ID of the user.
 * @returns {Promise<Activity[]>} A list of activities.
 */
const getActivitiesByUser = async (userId) => {
  return await Activity.find({ user: userId }).sort({ date: -1 });
};

/**
 * Creates a new activity.
 * @param {object} activityData - The data for the new activity.
 * @param {string} userId - The ID of the user creating the activity.
 * @returns {Promise<Activity>} The newly created activity.
 */
const createActivity = async (activityData, userId) => {
  const newActivity = new Activity({
    ...activityData,
    user: userId,
  });
  return await newActivity.save();
};

/**
 * Finds an activity by its ID.
 * @param {string} activityId - The ID of the activity.
 * @returns {Promise<Activity|null>} The found activity or null.
 */
const findActivityById = async (activityId) => {
  return await Activity.findById(activityId);
};

/**
 * Deletes an activity by its ID.
 * @param {string} activityId - The ID of the activity to delete.
 */
const deleteActivityById = async (activityId) => {
  await Activity.findByIdAndDelete(activityId);
};

module.exports = {
  getActivitiesByUser,
  createActivity,
  findActivityById,
  deleteActivityById,
};
