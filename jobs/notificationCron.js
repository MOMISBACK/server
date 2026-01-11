// server/jobs/notificationCron.js

const cron = require('node-cron');
const User = require('../models/User');
const WeeklyChallenge = require('../models/WeeklyChallenge');
const { sendDailyChallengeReminder, sendPushNotifications } = require('../services/pushNotificationService');

class NotificationCron {
  constructor() {
    this.locks = new Map();
    this.jobs = {
      dailyReminder: null,
    };
  }

  _acquireLock(jobName) {
    if (this.locks.get(jobName)) {
      console.log(`⏭️  [NOTIF-CRON ${jobName}] Déjà en cours, skip...`);
      return false;
    }
    this.locks.set(jobName, true);
    console.log(`🔒 [NOTIF-CRON ${jobName}] Lock acquis`);
    return true;
  }

  _releaseLock(jobName) {
    this.locks.delete(jobName);
    console.log(`🔓 [NOTIF-CRON ${jobName}] Lock libéré`);
  }

  async _runWithLock(jobName, jobFunction) {
    if (!this._acquireLock(jobName)) {
      return;
    }

    const startTime = Date.now();

    try {
      await jobFunction();
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`✅ [NOTIF-CRON ${jobName}] Terminé en ${duration}s`);
    } catch (error) {
      console.error(`❌ [NOTIF-CRON ${jobName}] Erreur:`, error.message);
      console.error(error.stack);
    } finally {
      this._releaseLock(jobName);
    }
  }

  /**
   * Calculate user's progress in a challenge
   */
  _calculateUserProgress(challenge, userId) {
    const player = challenge.players?.find(p => 
      p.user?._id?.toString() === userId.toString() || 
      p.user?.toString() === userId.toString()
    );
    return player?.progress || 0;
  }

  /**
   * Get all active challenges for a user
   */
  async _getActiveChallengesForUser(userId) {
    const now = new Date();
    
    // Find active challenges where user is a player
    const challenges = await WeeklyChallenge.find({
      status: 'active',
      endDate: { $gt: now },
      'players.user': userId,
    }).lean();

    return challenges.map(c => ({
      _id: c._id,
      title: c.title,
      mode: c.mode,
      endDate: c.endDate,
      goals: c.goals,
      activityTypes: c.activityTypes,
      userProgress: this._calculateUserProgress(c, userId),
    }));
  }

  /**
   * Send daily reminders to all users with active challenges
   * Runs multiple times a day to catch users at their preferred time
   */
  async _sendDailyReminders(targetHour) {
    console.log(`📬 [NOTIF-CRON] Envoi des rappels pour l'heure ${targetHour}h...`);

    // Find users who:
    // 1. Have a push token
    // 2. Want daily reminders
    // 3. Have their preferred hour matching now (or default 9am)
    const users = await User.find({
      pushToken: { $ne: null, $exists: true },
      $or: [
        { 'notificationPreferences.dailyReminder': { $ne: false } },
        { 'notificationPreferences': { $exists: false } },
      ],
      $or: [
        { 'notificationPreferences.dailyReminderHour': targetHour },
        { 
          'notificationPreferences.dailyReminderHour': { $exists: false },
          // Default hour is 9
        },
      ],
    }).select('_id username email pushToken notificationPreferences').lean();

    // Filter for users whose preferred hour matches (or default 9)
    const eligibleUsers = users.filter(user => {
      const preferredHour = user.notificationPreferences?.dailyReminderHour ?? 9;
      return preferredHour === targetHour;
    });

    console.log(`👥 ${eligibleUsers.length} utilisateurs éligibles pour l'heure ${targetHour}h`);

    if (eligibleUsers.length === 0) {
      return { sent: 0, skipped: 0 };
    }

    let sentCount = 0;
    let skippedCount = 0;
    const notifications = [];

    for (const user of eligibleUsers) {
      try {
        const challenges = await this._getActiveChallengesForUser(user._id);
        
        if (challenges.length === 0) {
          skippedCount++;
          continue;
        }

        // Build notification
        const greeting = this._getGreeting();
        const name = user.username || user.email?.split('@')[0] || 'Champion';
        
        // Build condensed challenge summary
        const lines = challenges.slice(0, 3).map(c => {
          const mode = c.mode === 'duo' ? '👥' : '🏃';
          const progress = Math.min(100, Math.round((c.userProgress || 0) * 100));
          const countdown = this._formatCountdown(c.endDate);
          const title = (c.title || 'Challenge').substring(0, 18);
          return `${mode} ${title}: ${progress}% ⏱${countdown}`;
        });

        if (challenges.length > 3) {
          lines.push(`+${challenges.length - 3} autre(s)`);
        }

        notifications.push({
          to: user.pushToken,
          title: `${greeting} ${name}! 🏆 ${challenges.length} pacte${challenges.length > 1 ? 's' : ''} en cours`,
          body: lines.join('\n'),
          data: {
            type: 'daily_reminder',
            challengeCount: challenges.length,
          },
          channelId: 'reminders',
          sound: 'default',
        });

        sentCount++;
      } catch (error) {
        console.error(`❌ Erreur pour user ${user._id}:`, error.message);
        skippedCount++;
      }
    }

    // Send all notifications in batch
    if (notifications.length > 0) {
      const result = await sendPushNotifications(notifications);
      console.log(`📤 Envoyé: ${result.sent}, Erreurs: ${result.errors?.length || 0}`);
    }

    return { sent: sentCount, skipped: skippedCount };
  }

  _getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bonjour';
    if (hour < 18) return 'Bon après-midi';
    return 'Bonsoir';
  }

  _formatCountdown(endDate) {
    const now = new Date();
    const end = new Date(endDate);
    const diffMs = end - now;
    
    if (diffMs <= 0) return '0';
    
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) {
      return `${days}j${hours}h`;
    }
    return `${hours}h`;
  }

  /**
   * Start the daily reminder cron job
   * Runs every hour to catch users at their preferred reminder time
   */
  startDailyReminderCron() {
    // Run at minute 0 of every hour
    this.jobs.dailyReminder = cron.schedule('0 * * * *', async () => {
      await this._runWithLock('DAILY_REMINDER', async () => {
        const currentHour = new Date().getHours();
        console.log(`🕐 [NOTIF-CRON] Vérification rappels pour ${currentHour}h...`);
        
        const result = await this._sendDailyReminders(currentHour);
        console.log(`📊 Résultats: ${result.sent} envoyés, ${result.skipped} ignorés`);
      });
    });

    console.log('✅ NOTIF-CRON job activé: Rappels quotidiens (toutes les heures)');
  }

  /**
   * Manually trigger daily reminders for testing
   */
  async triggerDailyRemindersNow() {
    const currentHour = new Date().getHours();
    console.log(`🧪 [TEST] Déclenchement manuel des rappels pour ${currentHour}h`);
    return this._sendDailyReminders(currentHour);
  }

  /**
   * Send a test notification to a specific user
   */
  async sendTestNotification(userId) {
    const user = await User.findById(userId).select('username email pushToken').lean();
    
    if (!user?.pushToken) {
      return { success: false, error: 'User has no push token' };
    }

    const challenges = await this._getActiveChallengesForUser(userId);
    
    return sendDailyChallengeReminder({
      user,
      challenges,
    });
  }

  /**
   * Stop all cron jobs
   */
  stopAll() {
    Object.values(this.jobs).forEach(job => {
      if (job) job.stop();
    });
    console.log('🛑 [NOTIF-CRON] Tous les jobs arrêtés');
  }
}

// Singleton instance
const notificationCron = new NotificationCron();

module.exports = notificationCron;
