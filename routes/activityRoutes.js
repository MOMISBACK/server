const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const Activity = require('../models/Activity');

// @route   GET /api/activities
// @desc    Get user activities
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const activities = await Activity.find({ user: req.user.id }).sort({ date: -1 });
    res.json(activities);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST /api/activities
// @desc    Create a new activity
// @access  Private
router.post('/', protect, async (req, res) => {
  const { title, type, duration, distance, calories, date } = req.body;

  try {
    const newActivity = new Activity({
      user: req.user.id,
      title,
      type,
      duration,
      distance,
      calories,
      date,
    });

    const activity = await newActivity.save();
    res.json(activity);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE /api/activities/:id
// @desc    Delete an activity
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    let activity = await Activity.findById(req.params.id);

    if (!activity) {
      return res.status(404).json({ msg: 'Activity not found' });
    }

    // Make sure user owns the activity
    if (activity.user.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'Not authorized' });
    }

    await Activity.findByIdAndDelete(req.params.id);

    res.json({ msg: 'Activity removed' });
  } catch (error) {
    console.error(error.message);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Activity not found' });
    }
    res.status(500).send('Server Error');
  }
});

module.exports = router;
