// server/services/challenge/helpers.js
// Module avec les fonctions utilitaires pour les challenges

/**
 * Clamp a number between min and max
 */
const clamp = (x, min, max) => {
  const n = Number(x);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
};

/**
 * Check if challenge has multi-goals (distance/duration/count)
 */
const hasMultiGoals = (challenge) => {
  const mg = challenge?.multiGoals;
  if (!mg || typeof mg !== 'object') return false;
  return Boolean(
    (Number(mg.distance) > 0) ||
    (Number(mg.duration) > 0) ||
    (Number(mg.count) > 0)
  );
};

/**
 * Extract multi-goals from challenge
 */
const getMultiGoals = (challenge) => {
  const mg = challenge?.multiGoals;
  if (!mg || typeof mg !== 'object') return null;
  const distance = Number(mg.distance);
  const duration = Number(mg.duration);
  const count = Number(mg.count);
  const out = {
    distance: Number.isFinite(distance) && distance > 0 ? distance : null,
    duration: Number.isFinite(duration) && duration > 0 ? duration : null,
    count: Number.isFinite(count) && count > 0 ? count : null,
  };
  return out.distance || out.duration || out.count ? out : null;
};

/**
 * Calculate multi-goal progress for a set of activities
 */
const calcMultiGoalProgressForActivities = (activities, multiGoals) => {
  const mg = multiGoals;
  if (!mg) return null;

  const currentDistance = (activities || []).reduce((sum, a) => sum + Number(a?.distance || 0), 0);
  const currentDuration = (activities || []).reduce((sum, a) => sum + Number(a?.duration || 0), 0);
  const currentCount = (activities || []).length;

  const breakdown = {};
  const ratios = [];

  if (mg.distance) {
    const r = mg.distance > 0 ? currentDistance / mg.distance : 0;
    breakdown.distance = {
      current: Math.round(currentDistance * 10) / 10,
      target: mg.distance,
      completed: Number.isFinite(r) ? r >= 1 : false,
    };
    ratios.push(Number.isFinite(r) ? r : 0);
  }
  if (mg.duration) {
    const r = mg.duration > 0 ? currentDuration / mg.duration : 0;
    breakdown.duration = {
      current: Math.round(currentDuration * 10) / 10,
      target: mg.duration,
      completed: Number.isFinite(r) ? r >= 1 : false,
    };
    ratios.push(Number.isFinite(r) ? r : 0);
  }
  if (mg.count) {
    const r = mg.count > 0 ? currentCount / mg.count : 0;
    breakdown.count = {
      current: currentCount,
      target: mg.count,
      completed: Number.isFinite(r) ? r >= 1 : false,
    };
    ratios.push(Number.isFinite(r) ? r : 0);
  }

  if (!ratios.length) return null;
  const minRatio = Math.min(...ratios);
  const clampedRatio = clamp(minRatio, 0, 1);
  const percentage = Math.round(clampedRatio * 100);
  const allCompleted = ratios.every((r) => r >= 1);

  return { breakdown, minRatio, percentage, allCompleted };
};

/**
 * Check if challenge is a progression pact (effort points based)
 */
const isProgressionPact = (challenge) => {
  const legacy = Boolean(challenge && challenge.mode === 'duo' && challenge.goal?.type === 'effort_points');
  const v1 = Boolean(challenge && challenge.mode === 'duo' && challenge.pactRules === 'progression_7d_v1');
  return legacy || v1;
};

/**
 * Calculate effort points for a set of activities
 */
const calcEffortPointsForActivities = (activities) => {
  const byType = new Map();
  for (const a of activities || []) {
    if (!a) continue;
    const t = a.type;
    if (!t) continue;
    const agg = byType.get(t) || { km: 0, min: 0, sessions: 0 };
    agg.km += Number(a.distance || 0);
    agg.min += Number(a.duration || 0);
    agg.sessions += 1;
    byType.set(t, agg);
  }

  const weights = {
    walking: { km: 0.35, min: 0.06, sessions: 0.5 },
    running: { km: 0.8, min: 0.1, sessions: 0.7 },
    cycling: { km: 0.2, min: 0.05, sessions: 0.6 },
    swimming: { km: 2.0, min: 0.08, sessions: 0.7 },
    workout: { km: 0.0, min: 0.09, sessions: 0.9 },
  };

  let total = 0;
  for (const [type, agg] of byType.entries()) {
    const w = weights[type];
    if (!w) continue;
    total += (w.km * (agg.km || 0)) + (w.min * (agg.min || 0)) + (w.sessions * (agg.sessions || 0));
  }

  // Keep a stable, readable number for UI
  return Math.round(total * 10) / 10;
};

/**
 * Check if challenge has expired (past end date)
 */
const isExpired = (challenge) => {
  if (!challenge?.endDate) return false;
  return new Date() > new Date(challenge.endDate);
};

/**
 * Check if challenge is a success (all players completed before end date)
 */
const isSuccess = (challenge) => {
  if (!challenge || !challenge.endDate) return false;
  const end = new Date(challenge.endDate);

  if (challenge.mode === 'solo') {
    const p = Array.isArray(challenge.players) ? challenge.players[0] : null;
    if (!p?.completed || !p?.completedAt) return false;
    return new Date(p.completedAt) <= end;
  }

  if (challenge.mode === 'duo') {
    const players = Array.isArray(challenge.players) ? challenge.players : [];
    if (players.length !== 2) return false;
    return players.every((p) => p?.completed && p?.completedAt && new Date(p.completedAt) <= end);
  }

  return false;
};

/**
 * Normalize week dates to Monday 00:00:00 - Sunday 23:59:59
 */
const getWeekBounds = () => {
  const now = new Date();
  const day = now.getDay();
  const daysToMonday = (day + 6) % 7;
  
  const startDate = new Date(now);
  startDate.setDate(now.getDate() - daysToMonday);
  startDate.setHours(0, 0, 0, 0);
  
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);
  endDate.setHours(23, 59, 59, 999);
  
  return { startDate, endDate };
};

/**
 * Get player ID from player object (handles both populated and non-populated)
 */
const getPlayerId = (player) => {
  const u = player?.user;
  if (!u) return null;
  if (typeof u === 'string') return u;
  return u?._id?.toString?.() || u?.id?.toString?.() || null;
};

/**
 * Find player in challenge by user ID
 */
const findPlayer = (challenge, userId) => {
  if (!challenge?.players || !userId) return null;
  const id = userId.toString();
  return challenge.players.find((p) => {
    const pid = getPlayerId(p);
    return pid && pid.toString() === id;
  });
};

/**
 * Find other player in duo challenge
 */
const findOtherPlayer = (challenge, userId) => {
  if (!challenge?.players || !userId) return null;
  const id = userId.toString();
  return challenge.players.find((p) => {
    const pid = getPlayerId(p);
    return pid && pid.toString() !== id;
  });
};

module.exports = {
  clamp,
  hasMultiGoals,
  getMultiGoals,
  calcMultiGoalProgressForActivities,
  isProgressionPact,
  calcEffortPointsForActivities,
  isExpired,
  isSuccess,
  getWeekBounds,
  getPlayerId,
  findPlayer,
  findOtherPlayer,
};
