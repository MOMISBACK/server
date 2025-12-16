const crypto = require('crypto');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const sendGridEmail = require('../utils/sendGridEmail');

// Helper function to send verification email
const sendVerificationEmail = async (user) => {
  const verificationToken = user.getVerificationToken();
  await user.save({ validateBeforeSave: false });

  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
  const message = `
    Vous recevez cet email car une demande de compte sur Match My Pace a été faite avec cette adresse.
    Veuillez cliquer sur le lien ci-dessous pour vérifier votre adresse e-mail:
    ${verificationUrl}

    Si vous n'êtes pas à l'origine de cette demande, veuillez ignorer cet email.
  `;

  try {
    await sendGridEmail(
      user.email,
      'Vérification de votre adresse e-mail',
      message,
      `<p>${message.replace(/\n/g, '<br>')}</p>`
    );
  } catch (err) {
    console.error(err);
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;
    await user.save({ validateBeforeSave: false });
    throw new Error('Email could not be sent');
  }
};

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
const register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    let user = await User.findOne({ email });

    if (user && user.isVerified) {
      return res.status(400).json({ message: 'User already exists' });
    }

    if (user && !user.isVerified) {
      // User exists but is not verified, resend verification email
    } else if (!user) {
      user = await User.create({
        email,
        password,
      });
    }

    await sendVerificationEmail(user);
    res.status(200).json({
      success: true,
      data: 'Verification email sent. Please check your inbox.',
    });
  } catch (error) {
    console.error(error);
    if (error.message === 'Email could not be sent') {
      return res
        .status(500)
        .json({ message: 'Error sending verification email.' });
    }
    res.status(500).json({ message: 'Server Error' });
  }
};

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
// @access  Public
const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check if password matches
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check if user is verified
    if (user.isVerified === false) {
      await sendVerificationEmail(user);
      return res
        .status(401)
        .json({
          message:
            'Please verify your email to log in. A new verification email has been sent to your inbox.',
        });
    }

    res.json({
      _id: user._id,
      email: user.email,
      token: generateToken(user._id),
    });
  } catch (error) {
    console.error(error);
    if (error.message === 'Email could not be sent') {
      return res
        .status(500)
        .json({ message: 'Error sending verification email.' });
    }
    res.status(500).json({ message: 'Server Error' });
  }
};

// @route   GET /api/auth/me
// @desc    Get user profile
// @access  Private
const getMe = (req, res) => {
  res.status(200).json(req.user);
};

// @route   GET /api/auth/verify-email
// @desc    Verify email address
// @access  Public
const verifyEmail = async (req, res) => {
  try {
    const token = req.query.token;

    if (!token) {
      return res.status(400).json({ message: 'Invalid token' });
    }

    const verificationToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    const user = await User.findOne({
      verificationToken,
      verificationTokenExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;
    await user.save();

    res.status(200).json({ success: true, data: 'Email verified successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @route   POST /api/auth/forgot-password
// @desc    Forgot password
// @access  Public
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user || !user.isVerified) {
      return res.status(200).json({
        success: true,
        data: 'If an account with that email exists, a password reset email has been sent.',
      });
    }

    const resetToken = user.getResetPasswordToken();
    await user.save({ validateBeforeSave: false });

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    const message = `
      Vous recevez cet email car vous avez demandé la réinitialisation de votre mot de passe pour votre compte sur Match My Pace.
      Veuillez cliquer sur le lien ci-dessous pour réinitialiser votre mot de passe:
      ${resetUrl}

      Si vous n'avez pas demandé cette réinitialisation, veuillez ignorer cet email.
    `;

    await sendGridEmail(
      user.email,
      'Réinitialisation de votre mot de passe',
      message,
      `<p>${message.replace(/\n/g, '<br>')}</p>`
    );

    res.status(200).json({
      success: true,
      data: 'Email sent',
    });
  } catch (error) {
    console.error(error);

    // Attempt to reset the token fields if email sending fails
    const { email } = req.body;
    const userToUpdate = await User.findOne({ email });
    if (userToUpdate) {
      userToUpdate.resetPasswordToken = undefined;
      userToUpdate.resetPasswordExpires = undefined;
      await userToUpdate.save({ validateBeforeSave: false });
    }

    res.status(500).json({ message: 'Email could not be sent' });
  }
};


// @route   PUT /api/auth/reset-password/:token
// @desc    Reset password
// @access  Public
const resetPassword = async (req, res) => {
  try {
    const resetPasswordToken = crypto
      .createHash('sha256')
      .update(req.params.token)
      .digest('hex');

    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      data: 'Password updated successfully',
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @route   PUT /api/auth/update-password
// @desc    Update user password
// @access  Private
const updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isMatch = await user.matchPassword(currentPassword);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid current password' });
    }

    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      data: 'Password updated successfully',
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

module.exports = {
  register,
  login,
  getMe,
  verifyEmail,
  forgotPassword,
  resetPassword,
  updatePassword,
};
