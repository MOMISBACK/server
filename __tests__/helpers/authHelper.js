const jwt = require('jsonwebtoken');
const User = require('../../models/User');

async function createTestUserWithToken() {
  const user = await User.create({
    username: `testuser_${Date.now()}`,
    email: `test_${Date.now()}@example.com`,
    password: 'Password123!',
  });

  const token = jwt.sign(
    { id: user._id },
    process.env.JWT_SECRET || 'test_secret_key',
    { expiresIn: '7d' }
  );

  return { user, token };
}

function mockProtectMiddleware(user) {
  return (req, res, next) => {
    req.user = user;
    next();
  };
}

module.exports = {
  createTestUserWithToken,
  mockProtectMiddleware,
};
