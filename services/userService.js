const User = require('../models/User');

/**
 * Creates a new user in the database.
 * @param {string} email - The user's email.
 * @param {string} password - The user's password.
 * @returns {Promise<User>} The created user object.
 */
const createUser = async (email, password) => {
  return await User.create({ email, password });
};

/**
 * Finds a user by their email.
 * @param {string} email - The user's email.
 * @returns {Promise<User|null>} The found user object or null.
 */
const findUserByEmail = async (email) => {
  return await User.findOne({ email });
};

/**
 * Finds a user by their ID.
 * @param {string} id - The user's ID.
 * @returns {Promise<User|null>} The found user object or null.
 */
const getUserById = async (id) => {
  return await User.findById(id).select('-password');
};

/**
 * Retrieves all users from the database.
 * @returns {Promise<User[]>} An array of user objects.
 */
const getAllUsers = async () => {
  return await User.find({}).select('-password');
};


module.exports = {
  createUser,
  findUserByEmail,
  getUserById,
  getAllUsers,
};
