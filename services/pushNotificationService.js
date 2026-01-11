/**
 * Push Notification Service - Server-side
 * 
 * Sends push notifications via Expo Push API
 * Docs: https://docs.expo.dev/push-notifications/sending-notifications/
 */

const https = require('https');

const EXPO_PUSH_API = 'https://exp.host/--/api/v2/push/send';

/**
 * Format duration in minutes to human readable string
 */
function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return '0 min';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

/**
 * Format countdown to human readable string
 */
function formatCountdown(endDate) {
  const now = new Date();
  const end = new Date(endDate);
  const diffMs = end - now;
  
  if (diffMs <= 0) return 'Terminé';
  
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (days > 0) {
    return `${days}j ${hours}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}min`;
  } else {
    return `${minutes}min`;
  }
}

/**
 * Format a challenge for notification display
 */
function formatChallengeForNotification(challenge, userProgress) {
  const countdown = formatCountdown(challenge.endDate);
  const mode = challenge.mode === 'duo' ? '👥' : '🏃';
  
  // Build goal summary
  const goals = [];
  if (challenge.goals?.distance?.target) {
    goals.push(`${challenge.goals.distance.target}km`);
  }
  if (challenge.goals?.duration?.target) {
    goals.push(formatDuration(challenge.goals.duration.target));
  }
  if (challenge.goals?.count?.target) {
    goals.push(`${challenge.goals.count.target} séances`);
  }
  
  const goalText = goals.length > 0 ? goals.join(' • ') : 'Objectif';
  const progressPercent = Math.min(100, Math.round((userProgress || 0) * 100));
  
  return `${mode} ${challenge.title || 'Challenge'}\n⏱️ ${countdown} | 📊 ${progressPercent}% | ${goalText}`;
}

/**
 * Send a push notification to a single Expo push token
 */
async function sendPushNotification({ token, title, body, data = {}, channelId = 'challenges' }) {
  // Validate Expo push token format
  if (!token || !token.startsWith('ExponentPushToken[')) {
    console.warn('[PushService] Invalid token format:', token?.substring(0, 30));
    return { success: false, error: 'Invalid token format' };
  }

  const message = {
    to: token,
    sound: 'default',
    title,
    body,
    data,
    channelId,
    priority: 'high',
  };

  return sendPushNotifications([message]);
}

/**
 * Send multiple push notifications in a batch
 * Expo allows up to 100 notifications per request
 */
async function sendPushNotifications(messages) {
  if (!messages || messages.length === 0) {
    return { success: true, sent: 0 };
  }

  // Filter out invalid tokens
  const validMessages = messages.filter(m => m.to && m.to.startsWith('ExponentPushToken['));
  
  if (validMessages.length === 0) {
    console.log('[PushService] No valid tokens to send to');
    return { success: true, sent: 0 };
  }

  // Batch in groups of 100
  const batches = [];
  for (let i = 0; i < validMessages.length; i += 100) {
    batches.push(validMessages.slice(i, i + 100));
  }

  let totalSent = 0;
  let errors = [];

  for (const batch of batches) {
    try {
      const result = await sendBatch(batch);
      totalSent += result.sent;
      if (result.errors) {
        errors = errors.concat(result.errors);
      }
    } catch (error) {
      console.error('[PushService] Batch error:', error.message);
      errors.push(error.message);
    }
  }

  return {
    success: errors.length === 0,
    sent: totalSent,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Send a batch of notifications to Expo Push API
 */
function sendBatch(messages) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(messages);
    
    const options = {
      hostname: 'exp.host',
      path: '/--/api/v2/push/send',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          
          if (response.errors) {
            console.error('[PushService] API errors:', response.errors);
            resolve({ sent: 0, errors: response.errors });
          } else if (response.data) {
            // Count successful sends
            const sent = response.data.filter(r => r.status === 'ok').length;
            const failed = response.data.filter(r => r.status === 'error');
            
            if (failed.length > 0) {
              console.warn('[PushService] Some notifications failed:', 
                failed.map(f => f.message || f.details?.error).join(', ')
              );
            }
            
            resolve({ 
              sent, 
              errors: failed.length > 0 ? failed.map(f => f.message || f.details?.error) : undefined 
            });
          } else {
            resolve({ sent: messages.length });
          }
        } catch (e) {
          console.error('[PushService] Parse error:', e.message);
          reject(e);
        }
      });
    });

    req.on('error', (e) => {
      console.error('[PushService] Request error:', e.message);
      reject(e);
    });

    req.write(data);
    req.end();
  });
}

/**
 * Build daily challenge reminder notification content
 */
function buildDailyChallengeNotification(challenges, userName) {
  if (!challenges || challenges.length === 0) {
    return null;
  }

  const greeting = getTimeBasedGreeting();
  const name = userName || 'Champion';
  
  // Build condensed body with all challenges
  const challengeLines = challenges.map(c => {
    const countdown = formatCountdown(c.endDate);
    const mode = c.mode === 'duo' ? '👥' : '🏃';
    const progress = Math.min(100, Math.round((c.userProgress || 0) * 100));
    
    // Very condensed format
    return `${mode} ${c.title?.substring(0, 20) || 'Challenge'}: ${progress}% (${countdown})`;
  });

  return {
    title: `${greeting} ${name}! 🏆`,
    body: challengeLines.join('\n'),
    data: {
      type: 'daily_reminder',
      challengeCount: challenges.length,
    },
  };
}

/**
 * Get time-based greeting
 */
function getTimeBasedGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bonjour';
  if (hour < 18) return 'Bon après-midi';
  return 'Bonsoir';
}

/**
 * Send daily challenge reminder to a user
 */
async function sendDailyChallengeReminder({ user, challenges }) {
  if (!user.pushToken) {
    return { success: false, error: 'No push token' };
  }

  // Check if user wants daily reminders
  if (user.notificationPreferences?.dailyReminder === false) {
    return { success: false, error: 'User disabled daily reminders' };
  }

  const notification = buildDailyChallengeNotification(
    challenges, 
    user.username || user.email?.split('@')[0]
  );

  if (!notification) {
    return { success: false, error: 'No active challenges' };
  }

  return sendPushNotification({
    token: user.pushToken,
    title: notification.title,
    body: notification.body,
    data: notification.data,
    channelId: 'reminders',
  });
}

module.exports = {
  sendPushNotification,
  sendPushNotifications,
  sendDailyChallengeReminder,
  buildDailyChallengeNotification,
  formatChallengeForNotification,
  formatCountdown,
  formatDuration,
};
