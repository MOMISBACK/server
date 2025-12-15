const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const {
  register,
  login,
  getMe,
  verifyEmail,
  forgotPassword,
  resetPassword,
  updatePassword,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

router.post(
  '/register',
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  register
);

router.post(
  '/login',
  body('email').isEmail().normalizeEmail(),
  body('password').not().isEmpty(),
  login
);

router.get('/me', protect, getMe);

router.get('/verify-email', verifyEmail);

router.post(
  '/forgot-password',
  body('email').isEmail().normalizeEmail(),
  forgotPassword
);

router.put(
  '/reset-password/:token',
  body('password').isLength({ min: 6 }),
  resetPassword
);

router.put(
  '/update-password',
  protect,
  body('newPassword').isLength({ min: 6 }),
  updatePassword
);

module.exports = router;
