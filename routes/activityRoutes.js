const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const activityController = require('../controllers/activityController');
const { validateCreateActivity } = require('../validators/activityValidators');

// Toutes les routes nécessitent une authentification
router.use(protect);

// Routes
router.get('/', activityController.getActivities); // ✅ Corrigé : getActivities (pas getUserActivities)
router.post('/', validateCreateActivity, activityController.createActivity);
router.delete('/:id', activityController.deleteActivity);

module.exports = router;
