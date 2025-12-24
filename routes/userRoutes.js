const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
	getUserProfile,
	getUsers,
	getPartnerLinks,
	updatePartnerLinks,
	updateActiveSlot,
	updateUsername,
	getHealthStatus,
	updateHealthStatus,
	sendPartnerInvite,
	getIncomingPartnerInvites,
	acceptPartnerInvite,
	refusePartnerInvite,
	claimDailyChest,
} = require('../controllers/userController');

// @route   GET /api/users/profile
// @desc    Get user profile
// @access  Private
router.get('/profile', protect, getUserProfile);

// @route   GET /api/users
// @desc    Get all users
// @access  Private
router.get('/', protect, getUsers);

// @route   GET /api/users/partner-links
// @desc    Get user's partner links (P1, P2)
// @access  Private
router.get('/partner-links', protect, getPartnerLinks);

// @route   PUT /api/users/partner-links
// @desc    Update user's partner links
// @access  Private
router.put('/partner-links', protect, updatePartnerLinks);

// @route   PUT /api/users/active-slot
// @desc    Update active slot (p1, p2, solo)
// @access  Private
router.put('/active-slot', protect, updateActiveSlot);

// @route   PUT /api/users/username
// @desc    Set or update current user's username
// @access  Private
router.put('/username', protect, updateUsername);

// @route   GET /api/users/health
// @desc    Get health integration status (Apple Health / Health Connect)
// @access  Private
router.get('/health', protect, getHealthStatus);

// @route   PUT /api/users/health
// @desc    Update health integration status (link/unlink, autoImport, lastSyncAt)
// @access  Private
router.put('/health', protect, updateHealthStatus);

// @route   POST /api/users/daily-chest
// @desc    Claim daily chest reward (5 diamonds, 1 per 24h)
// @access  Private
router.post('/daily-chest', protect, claimDailyChest);

// @route   POST /api/users/partner-invites
// @desc    Send partner invite for a slot (p1/p2)
// @access  Private
router.post('/partner-invites', protect, sendPartnerInvite);

// @route   GET /api/users/partner-invites/incoming
// @desc    List incoming pending partner invites
// @access  Private
router.get('/partner-invites/incoming', protect, getIncomingPartnerInvites);

// @route   POST /api/users/partner-invites/:inviteId/accept
// @desc    Accept a partner invite
// @access  Private
router.post('/partner-invites/:inviteId/accept', protect, acceptPartnerInvite);

// @route   POST /api/users/partner-invites/:inviteId/refuse
// @desc    Refuse a partner invite
// @access  Private
router.post('/partner-invites/:inviteId/refuse', protect, refusePartnerInvite);

module.exports = router;
