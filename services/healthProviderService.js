/**
 * Health Provider Service
 * Centralized logic for managing health provider linking/unlinking
 * Extracted from stravaController.js to eliminate ~40 lines of duplication
 */

const User = require('../models/User');

/**
 * Provider types supported by the system
 * @typedef {'appleHealth' | 'healthConnect' | 'strava'} HealthProviderType
 */

/**
 * Unlink other health providers when linking a new one
 * Only ONE provider can be active at a time
 * 
 * @param {Object} user - Mongoose user document
 * @param {string} newProvider - The provider being linked
 * @returns {string|null} - The previously active provider that was unlinked, or null
 */
function unlinkOtherProviders(user, newProvider) {
  if (!user.health?.activeProvider || user.health.activeProvider === newProvider) {
    return null;
  }

  const prevProvider = user.health.activeProvider;
  
  // Unlink the previous provider
  if (user.health[prevProvider]) {
    user.health[prevProvider].linked = false;
    user.health[prevProvider].autoImport = false;
  }

  console.log(`[HealthProvider] Unlinked ${prevProvider} for user ${user._id} (switching to ${newProvider})`);
  
  return prevProvider;
}

/**
 * Link Strava provider for a user
 * Handles unlinking other providers and setting up Strava data
 * 
 * @param {Object} user - Mongoose user document
 * @param {Object} tokens - Strava OAuth tokens object
 * @param {string} tokens.accessToken
 * @param {string} tokens.refreshToken
 * @param {Date} tokens.expiresAt
 * @param {string} tokens.scope
 * @param {Object} tokens.athlete - Strava athlete info
 * @returns {string|null} - Previously active provider that was unlinked
 */
function linkStravaProvider(user, tokens) {
  // Unlink previous provider if different
  const unlinkedProvider = unlinkOtherProviders(user, 'strava');

  // Initialize health object if needed
  user.health = user.health || {};

  // Set Strava data
  user.health.strava = {
    linked: true,
    autoImport: true,
    athleteId: String(tokens.athlete.id),
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    tokenExpiresAt: tokens.expiresAt,
    scope: tokens.scope,
  };
  
  // Set as active provider
  user.health.activeProvider = 'strava';

  // Import profile picture from Strava if available
  if (tokens.athlete?.profile) {
    user.profilePicture = tokens.athlete.profile;
  }

  return unlinkedProvider;
}

/**
 * Link native health provider (Apple Health or Health Connect)
 * 
 * @param {Object} user - Mongoose user document
 * @param {'appleHealth' | 'healthConnect'} provider - The native provider
 * @param {Object} options
 * @param {boolean} options.autoImport - Whether to enable auto import
 * @returns {string|null} - Previously active provider that was unlinked
 */
function linkNativeProvider(user, provider, options = {}) {
  const { autoImport = true } = options;

  // Unlink previous provider if different
  const unlinkedProvider = unlinkOtherProviders(user, provider);

  // Initialize health object if needed
  user.health = user.health || {};

  // Set native provider data
  user.health[provider] = {
    linked: true,
    autoImport,
  };
  
  // Set as active provider
  user.health.activeProvider = provider;

  return unlinkedProvider;
}

/**
 * Disconnect a health provider
 * 
 * @param {Object} user - Mongoose user document
 * @param {string} provider - The provider to disconnect
 * @returns {boolean} - Whether the provider was disconnected
 */
function disconnectProvider(user, provider) {
  if (!user.health?.[provider]) {
    return false;
  }

  user.health[provider].linked = false;
  user.health[provider].autoImport = false;

  // Clear active provider if it was this one
  if (user.health.activeProvider === provider) {
    user.health.activeProvider = null;
  }

  // For Strava, also clear tokens
  if (provider === 'strava' && user.health.strava) {
    user.health.strava.accessToken = null;
    user.health.strava.refreshToken = null;
    user.health.strava.tokenExpiresAt = null;
  }

  console.log(`[HealthProvider] Disconnected ${provider} for user ${user._id}`);
  
  return true;
}

/**
 * Get active provider info for a user
 * 
 * @param {Object} user - Mongoose user document
 * @returns {Object|null} - Active provider info or null
 */
function getActiveProviderInfo(user) {
  const activeProvider = user.health?.activeProvider;
  if (!activeProvider) return null;

  const providerData = user.health[activeProvider];
  if (!providerData?.linked) return null;

  return {
    provider: activeProvider,
    linked: providerData.linked,
    autoImport: providerData.autoImport || false,
    lastSyncAt: providerData.lastSyncAt || null,
  };
}

module.exports = {
  unlinkOtherProviders,
  linkStravaProvider,
  linkNativeProvider,
  disconnectProvider,
  getActiveProviderInfo,
};
