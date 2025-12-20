const Activity = require('../models/Activity');

/**
 * Gets activities based on a query object.
 * @param {object} query - The query object for filtering activities (e.g., { userId, type }).
 * @returns {Promise<Activity[]>} A list of activities.
 */
const getActivities = async (query) => {
  return await Activity.find(query).sort({ startTime: -1 });
};

/**
 * Creates a new activity. The data is automatically validated by the Mongoose schema.
 * @param {object} activityData - The data for the new activity, including userId.
 * @returns {Promise<Activity>} The newly created activity.
 */
const createActivity = async (activityData) => {
  const newActivity = new Activity(activityData);
  return await newActivity.save();
};

/**
 * Finds an activity by its ID.
 * @param {string} activityId - The ID of the activity.
 * @returns {Promise<Activity|null>} The found activity or null.
 */
const getActivityById = async (activityId) => {
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
  getActivities,
  createActivity,
  getActivityById,
  deleteActivityById,
};
