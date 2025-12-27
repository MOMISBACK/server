// server/services/challenge/index.js
// Entry point for challenge service modules
// Re-exports the main ChallengeService for backward compatibility

const challengeService = require('../challengeService');

// Also export sub-modules for direct access if needed
const diamondManager = require('./diamondManager');
const helpers = require('./helpers');

module.exports = {
  challengeService,
  diamondManager,
  helpers,
};
