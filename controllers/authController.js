const { validationResult } = require('express-validator');
const userService = require('../services/userService');
const generateToken = require('../utils/generateToken');

const formatValidationErrors = (errors) => {
  if (!Array.isArray(errors)) return undefined;
  return errors.map((e) => ({
    field: e.param,
    message: e.msg,
  }));
};

/**
 * Handles user registration.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 */
const registerUser = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: 'Invalid input',
      errors: formatValidationErrors(errors.array()),
    });
  }

  const { email, password, username } = req.body;

  try {
    const userExists = await userService.findUserByEmail(email);
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const usernameExists = await userService.findUserByUsername(username);
    if (usernameExists) {
      return res.status(400).json({ message: 'Username already taken' });
    }

    const user = await userService.createUser(email, password, username);

    if (user) {
      res.status(201).json({
        _id: user._id,
        username: user.username,
        email: user.email,
        token: generateToken(user._id),
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    // Ne pas exposer des détails sensibles au client, mais logger côté serveur.
    console.error('registerUser error:', error);

    // Duplication d'email (index unique)
    if (error?.code === 11000) {
      const key = Object.keys(error?.keyPattern || error?.keyValue || {})[0];
      if (key === 'username') {
        return res.status(400).json({ message: 'Username already taken' });
      }
      return res.status(400).json({ message: 'User already exists' });
    }

    // Validation Mongoose (regex email, minlength, etc.)
    if (error?.name === 'ValidationError') {
      const fieldErrors = Object.values(error.errors || {}).map((e) => ({
        field: e.path,
        message: e.message,
      }));
      return res.status(400).json({
        message: 'Invalid user data',
        errors: fieldErrors,
      });
    }

    // Problèmes DB / infra
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Handles user login.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 */
const loginUser = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: 'Invalid input',
      errors: formatValidationErrors(errors.array()),
    });
  }

  const { email, password } = req.body;

  try {
    const user = await userService.findUserByEmail(email);

    if (user && (await user.matchPassword(password))) {
      res.json({
        _id: user._id,
        username: user.username,
        email: user.email,
        token: generateToken(user._id),
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  registerUser,
  loginUser,
};
