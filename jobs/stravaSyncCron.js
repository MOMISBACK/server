/**
 * Strava Sync Cron Job
 * 
 * Automatically syncs Strava activities for all linked users.
 * Runs twice daily (6:00 AM and 6:00 PM UTC).
 * 
 * Note: Health Connect and Apple Health cannot be synced server-side
 * as the data lives on the user's device. Use client-side background sync for those.
 */

const cron = require('node-cron');
const User = require('../models/User');
const Activity = require('../models/Activity');
const stravaService = require('../services/stravaService');
const stravaConfig = require('../config/strava');

class StravaSyncCron {
  constructor() {
    this.isRunning = false;
    this.job = null;
    this.stats = {
      lastRun: null,
      usersProcessed: 0,
      activitiesImported: 0,
      errors: 0,
    };
  }

  /**
   * Start the cron job
   * Runs at 6:00 AM and 6:00 PM UTC
   */
  start() {
    if (!stravaConfig.isConfigured()) {
      console.log('⏭️  [StravaSyncCron] Strava not configured, skipping cron setup');
      return;
    }

    // Run at 6:00 and 18:00 UTC
    this.job = cron.schedule('0 6,18 * * *', async () => {
      await this.runSync();
    }, {
      timezone: 'UTC',
    });

    console.log('✅ [StravaSyncCron] Scheduled for 6:00 and 18:00 UTC');
  }

  /**
   * Stop the cron job
   */
  stop() {
    if (this.job) {
      this.job.stop();
      this.job = null;
      console.log('🛑 [StravaSyncCron] Stopped');
    }
  }

  /**
   * Run sync for all linked Strava users
   */
  async runSync() {
    if (this.isRunning) {
      console.log('⏭️  [StravaSyncCron] Already running, skipping...');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();
    
    console.log('🔄 [StravaSyncCron] Starting automatic sync...');

    let usersProcessed = 0;
    let totalImported = 0;
    let totalSkipped = 0;
    let errors = 0;

    try {
      // Find all users with Strava linked
      const users = await User.find({
        'health.strava.linked': true,
        'health.strava.accessToken': { $exists: true, $ne: null },
        'health.strava.refreshToken': { $exists: true, $ne: null },
      });

      console.log(`📊 [StravaSyncCron] Found ${users.length} users with Strava linked`);

      for (const user of users) {
        try {
          const result = await this.syncUserActivities(user);
          usersProcessed++;
          totalImported += result.imported;
          totalSkipped += result.skipped;
          
          if (result.imported > 0) {
            console.log(`  ✅ User ${user._id}: ${result.imported} imported, ${result.skipped} skipped`);
          }
        } catch (err) {
          errors++;
          console.error(`  ❌ User ${user._id}: ${err.message}`);
          
          // If token refresh failed, mark as unlinked
          if (err.message.includes('token') || err.message.includes('Token')) {
            await this.handleTokenError(user);
          }
        }

        // Small delay between users to avoid rate limits
        await this.delay(500);
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`✅ [StravaSyncCron] Complete in ${duration}s: ${usersProcessed} users, ${totalImported} imported, ${totalSkipped} skipped, ${errors} errors`);

      // Update stats
      this.stats = {
        lastRun: new Date(),
        usersProcessed,
        activitiesImported: totalImported,
        errors,
      };

    } catch (err) {
      console.error('❌ [StravaSyncCron] Fatal error:', err);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Sync activities for a single user
   */
  async syncUserActivities(user) {
    // Get valid access token (auto-refresh if needed)
    const accessToken = await stravaService.getValidAccessToken(user);

    // Determine time range: since last sync or last 24 hours
    const lastSync = user.health.strava.lastSyncAt;
    const after = lastSync 
      ? new Date(lastSync) 
      : new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    
    const before = new Date();

    // Fetch activities from Strava
    const stravaActivities = await stravaService.fetchActivities(accessToken, {
      after,
      before,
      perPage: 50, // Limit per user in cron
    });

    if (!stravaActivities.length) {
      // Update lastSyncAt even if no activities
      user.health.strava.lastSyncAt = new Date();
      await user.save();
      return { imported: 0, skipped: 0 };
    }

    let imported = 0;
    let skipped = 0;

    for (const stravaActivity of stravaActivities) {
      try {
        // Check for duplicate
        const existingActivity = await Activity.findOne({
          user: user._id,
          externalSource: 'strava',
          externalId: String(stravaActivity.id),
        });

        if (existingActivity) {
          skipped++;
          continue;
        }

        // Convert and save
        const mmp3Activity = stravaService.convertToMmp3Activity(stravaActivity, user._id);
        await Activity.create(mmp3Activity);
        imported++;
      } catch (err) {
        // Log but continue with other activities
        if (!err.message.includes('duplicate')) {
          console.warn(`    [StravaSyncCron] Activity ${stravaActivity.id}: ${err.message}`);
        }
        skipped++;
      }
    }

    // Update last sync time
    user.health.strava.lastSyncAt = new Date();
    await user.save();

    return { imported, skipped };
  }

  /**
   * Handle token errors by marking user as unlinked
   */
  async handleTokenError(user) {
    try {
      user.health.strava.linked = false;
      user.health.strava.accessToken = undefined;
      user.health.strava.refreshToken = undefined;
      
      if (user.health.activeProvider === 'strava') {
        user.health.activeProvider = null;
      }
      
      await user.save();
      console.log(`    ⚠️  User ${user._id}: Strava unlinked due to token error`);
    } catch (err) {
      console.error(`    ❌ Failed to unlink user ${user._id}:`, err.message);
    }
  }

  /**
   * Get current stats
   */
  getStats() {
    return this.stats;
  }

  /**
   * Utility delay function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Manual trigger (for testing or admin endpoints)
   */
  async triggerManualSync() {
    return this.runSync();
  }
}

// Singleton instance
const stravaSyncCron = new StravaSyncCron();

module.exports = stravaSyncCron;
