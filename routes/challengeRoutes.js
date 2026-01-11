// server/routes/challengeRoutes.js
// Refactored to use challengeController (previously 317 lines, now ~30 lines)

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const challengeController = require('../controllers/challengeController');

// GET endpoints
router.get('/current', protect, challengeController.getCurrentChallenge);
router.get('/invitations', protect, challengeController.getInvitations);
router.get('/pending-sent', protect, challengeController.getPendingSent);
router.get('/duo/history', protect, challengeController.getDuoHistory);
router.get('/solo/history', protect, challengeController.getSoloHistory);
router.get('/year-progress', protect, challengeController.getYearProgress);
router.get('/year-progress/:year', protect, challengeController.getYearProgress);

// POST endpoints
router.post('/', protect, challengeController.createChallenge);
router.post('/:id/accept', protect, challengeController.acceptInvitation);
router.post('/:id/refuse', protect, challengeController.refuseInvitation);
router.post('/:id/sign', protect, challengeController.signInvitation);
router.post('/:id/finalize', protect, challengeController.finalizeChallenge);
router.post('/refresh-progress', protect, challengeController.refreshProgress);

// PUT endpoints
router.put('/current', protect, challengeController.updateCurrentChallenge);
router.put('/:id/propose', protect, challengeController.proposeUpdate);

// DELETE endpoints
router.delete('/current', protect, challengeController.deleteCurrentChallenge);

module.exports = router;
