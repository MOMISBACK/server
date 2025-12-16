const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { protect } = require('../middleware/authMiddleware');
const {
  getUserActivities,
  addUserActivity,
  deleteUserActivity,
} = require('../controllers/activityController');

// @route   GET /api/activities
// @desc    Get user activities
// @access  Private
router.get('/', protect, getUserActivities);

// @route   POST /api/activities
// @desc    Create a new activity
// @access  Private
router.post(
  '/',
  protect,
  [
    body('title').not().isEmpty().trim().escape(),
    body('type').isIn(['course', 'velo', 'natation', 'marche']),
    body('duration').isFloat({ gt: 0 }),
    body('distance').optional().isFloat({ gt: 0 }),
    body('calories').optional().isFloat({ gt: 0 }),
    body('date').optional().isISO8601().toDate(),
  ],
  addUserActivity
);

// @route   DELETE /api/activities/:id
// @desc    Delete an activity
// @access  Private
router.delete('/:id', protect, deleteUserActivity);

module.exports = router;
