/**
 * Strava OAuth Configuration
 * 
 * Required environment variables:
 * - STRAVA_CLIENT_ID: App client ID from Strava Developer Portal
 * - STRAVA_CLIENT_SECRET: App client secret
 * - STRAVA_REDIRECT_URI: OAuth callback URL (e.g., https://server-ls5m.onrender.com/api/strava/callback)
 */

const stravaConfig = {
  clientId: process.env.STRAVA_CLIENT_ID,
  clientSecret: process.env.STRAVA_CLIENT_SECRET,
  redirectUri: process.env.STRAVA_REDIRECT_URI || 'https://server-ls5m.onrender.com/api/strava/callback',
  
  // OAuth endpoints
  authorizeUrl: 'https://www.strava.com/oauth/authorize',
  tokenUrl: 'https://www.strava.com/oauth/token',
  
  // API base URL
  apiBaseUrl: 'https://www.strava.com/api/v3',
  
  // Scopes needed for activity import
  // activity:read_all = read all activities including private ones
  scopes: ['activity:read_all'],
  
  // Token expiration buffer (refresh 5 min before actual expiry)
  tokenRefreshBuffer: 5 * 60 * 1000, // 5 minutes in ms
  
  // Activity types mapping: Strava -> MMP3
  activityTypeMap: {
    'Run': 'running',
    'TrailRun': 'running',
    'VirtualRun': 'running',
    'Ride': 'cycling',
    'MountainBikeRide': 'cycling',
    'GravelRide': 'cycling',
    'EBikeRide': 'cycling',
    'VirtualRide': 'cycling',
    'Walk': 'walking',
    'Hike': 'walking',
    'Swim': 'swimming',
    'WeightTraining': 'workout',
    'Workout': 'workout',
    'Yoga': 'workout',
    'Crossfit': 'workout',
    'Elliptical': 'workout',
    'StairStepper': 'workout',
    'RockClimbing': 'workout',
    // Default fallback handled in service
  },
  
  /**
   * Build the OAuth authorization URL
   * @param {string} state - CSRF state token (should be stored temporarily)
   * @returns {string} Full authorization URL
   */
  getAuthorizationUrl(state) {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: this.scopes.join(','),
      state: state,
      approval_prompt: 'auto', // 'force' to always show consent
    });
    return `${this.authorizeUrl}?${params.toString()}`;
  },
  
  /**
   * Check if configuration is valid
   * @returns {boolean}
   */
  isConfigured() {
    return Boolean(this.clientId && this.clientSecret);
  },
};

module.exports = stravaConfig;
