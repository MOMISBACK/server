const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { protect } = require('../middleware/authMiddleware');
const {
  getUserActivities,
  addUserActivity,
  deleteUserActivity,
} = require('../controllers/activityController');

// Validation rules for creating a new activity
const createActivityValidationRules = [
  body('type').isIn(['cycling', 'running', 'walking', 'swimming', 'workout']),
  body('startTime').isISO8601().toDate(),
  body('endTime').isISO8601().toDate(),
  body('duration').isFloat({ gt: 0 }),
  body('date').isISO8601().toDate(),
  body('source').isIn(['manual', 'tracked']),
  body('distance').optional().isFloat({ gt: 0 }),
  body('elevationGain').optional().isFloat({ gt: 0 }),
  body('avgSpeed').optional().isFloat({ gt: 0 }),
  body('poolLength').optional().isFloat({ gt: 0 }),
  body('laps').optional().isInt({ gt: 0 }),
  body('exercises').optional().isArray(),
  body('exercises.*.name').optional().notEmpty().trim(),
  body('exercises.*.sets').optional().isInt({ gt: 0 }),
  body('exercises.*.reps').optional().isInt({ gt: 0 }),
  body('exercises.*.weight').optional().isFloat({ gt: 0 }),
];


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
  createActivityValidationRules,
  addUserActivity
);

// @route   DELETE /api/activities/:id
// @desc    Delete an activity
// @access  Private
router.delete('/:id', protect, deleteUserActivity);

module.exports = router;
