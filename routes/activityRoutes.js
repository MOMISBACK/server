const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  createActivity,
  getActivities,
  getActivityById,
  deleteActivity,
} = require('../controllers/activityController');

// Apply the authentication middleware to all routes in this file
router.use(protect);

// Define the routes
router.post('/', createActivity);
router.get('/', getActivities);
router.get('/:id', getActivityById);
router.delete('/:id', deleteActivity);

module.exports = router;
