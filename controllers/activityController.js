const activityService = require('../services/activityService');

/**
 * Creates a new activity.
 */
const createActivity = async (req, res) => {
  try {
    const activityData = req.body;
    // Attach user ID from the authenticated user (provided by the 'protect' middleware)
    activityData.user = req.user.id;

    const activity = await activityService.createActivity(activityData);
    res.status(201).json(activity);
  } catch (error) {
    // Log the specific error to the console for debugging
    console.error('Error creating activity:', error.message);

    // Handle potential validation errors from the service
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    // Handle other potential errors
    res.status(500).json({ message: 'Server Error', error: error.message });
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
