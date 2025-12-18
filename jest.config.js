module.exports = {
  testEnvironment: 'node',
  coveragePathIgnorePatterns: ['/node_modules/'],
  testMatch: ['**/__tests__/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],
  testTimeout: 60000, // 60s (important pour le premier lancement)
  verbose: true,
  collectCoverageFrom: [
    'controllers/**/*.js',
    'services/**/*.js',
    'routes/**/*.js',
    '!**/node_modules/**',
    '!**/__tests__/**'
  ],
  maxWorkers: 1, // Important : 1 seul worker pour éviter conflits MongoDB
};
