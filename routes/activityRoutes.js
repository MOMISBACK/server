const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const Activity = require('../models/Activity');

// @desc    Create new activity
// @route   POST /api/activities
// @access  Private
router.post('/', protect, async (req, res) => {
  const { type, distance, duration, date } = req.body;

  try {
    const activity = new Activity({
      userId: req.user.id,
      type,
      distance,
      duration,
      date,
    });

    const createdActivity = await activity.save();
    res.status(201).json(createdActivity);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @desc    Get user activities
// @route   GET /api/activities
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const activities = await Activity.find({ userId: req.user.id });
    res.json(activities);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
});

module.exports = router;
