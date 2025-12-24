const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const activityController = require('../controllers/activityController');
const { validateCreateActivity } = require('../validators/activityValidators');

// Toutes les routes nécessitent une authentification
router.use(protect);

// Routes
router.get('/duo/current', activityController.getCurrentDuoChallengeActivities);
router.get('/shared/:partnerId', activityController.getSharedActivitiesWithPartner);
router.get('/', activityController.getActivities); // ✅ Corrigé : getActivities (pas getUserActivities)
router.post('/', validateCreateActivity, activityController.createActivity);
router.patch('/:id/reaction', activityController.setActivityReaction);
router.delete('/:id', activityController.deleteActivity);

module.exports = router;
