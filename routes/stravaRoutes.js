/**
 * Strava Routes
 * OAuth and sync endpoints for Strava integration
 */

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const stravaController = require('../controllers/stravaController');

// OAuth flow
// GET /api/strava/auth - Get authorization URL (requires auth)
router.get('/auth', protect, stravaController.initiateAuth);

// GET /api/strava/callback - OAuth callback (no auth - called by Strava)
router.get('/callback', stravaController.handleCallback);

// POST /api/strava/callback-code - Mobile callback (requires auth)
router.post('/callback-code', protect, stravaController.handleCallbackCode);

// Sync & status (all require auth)
// POST /api/strava/sync - Import activities
router.post('/sync', protect, stravaController.syncActivities);

// GET /api/strava/status - Get connection status
router.get('/status', protect, stravaController.getStatus);

// DELETE /api/strava/disconnect - Disconnect Strava
router.delete('/disconnect', protect, stravaController.disconnect);

module.exports = router;
