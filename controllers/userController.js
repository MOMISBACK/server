const userService = require('../services/userService');

/**
 * Gets the profile of the currently logged-in user.
 * The user object is attached to the request by the 'protect' middleware.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 */
const getUserProfile = (req, res) => {
  // The user data is already fetched by the protect middleware
  res.status(200).json(req.user);
};


/**
 * Gets all users.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 */
const getUsers = async (req, res) => {
  try {
    const users = await userService.getAllUsers();
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getUserProfile,
  getUsers,
};
