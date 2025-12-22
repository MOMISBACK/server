const jwt = require('jsonwebtoken');
const User = require('../../models/User');

async function createTestUserWithToken() {
  const suffix = Date.now().toString(36).slice(-8);
  const username = `tu_${suffix}`; // <= 20 chars, lowercase, unique enough for tests
  const user = await User.create({
    username,
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
