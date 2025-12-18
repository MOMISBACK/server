const activityService = require('../services/activityService');

/**
 * Creates a new activity.
 */
const createActivity = async (req, res) => {

  try {
    // Destructure only the expected fields from the request body
    const {
      title,
      type,
      duration,
      date,
      distance,
      elevationGain,
      exercises,
      startTime,
      endTime,
      source,
      avgSpeed,
      poolLength,
      laps,
    } = req.body;

    // Build the activity data object to align with the new schema
    const activityData = {
      user: req.user.id,
      title,
      type,
      duration,
      date,
      distance,
      elevationGain,
      exercises,
      startTime,
      endTime,
      source,
      avgSpeed,
      poolLength,
      laps,
    };

    const activity = await activityService.createActivity(activityData);
    res.status(201).json(activity);
  } catch (error) {
    console.error('--- Activity Creation Failed ---');
    console.error('Error Type:', error.name);
    console.error('Error Message:', error.message);

    if (error.name === 'ValidationError') {
      // Log the full validation error for detailed debugging
      console.error('Validation Error Details:', JSON.stringify(error.errors, null, 2));
      return res.status(400).json({
        message: 'Validation failed. Please check your data.',
        details: error.errors,
      });
    }

    // Log the full error object for any other type of error
    console.error('Full Error Object:', error);
    res.status(500).json({ message: 'An unexpected server error occurred.' });
  }
};

/**
 * Gets all activities for the logged-in user, with optional filtering by type.
 */
const getActivities = async (req, res) => {
  try {
    const { type } = req.query;
    const query = { user: req.user.id };

    if (type) {
      query.type = type;
    }

    const activities = await activityService.getActivities(query);
    res.status(200).json(activities);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

/**
 * Gets a single activity by its ID.
 */
const getActivityById = async (req, res) => {
  try {
    const { id } = req.params;
    const activity = await activityService.getActivityById(id);

    if (!activity) {
      return res.status(404).json({ message: 'Activity not found' });
    }

    // Optional: Check if the activity belongs to the user
    if (activity.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'User not authorized to access this activity' });
    }

    res.status(200).json(activity);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};


const deleteActivity = async (req, res) => {
  try {
    const { id } = req.params;
    const activity = await activityService.getActivityById(id);

    if (!activity) {
      return res.status(404).json({ message: 'Activity not found' });
    }

    if (activity.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'User not authorized to delete this activity' });
    }

    await activityService.deleteActivityById(id);
    res.status(200).json({ message: 'Activity deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

module.exports = {
  createActivity,
  getActivities,
  getActivityById,
  deleteActivity,
};
