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

// ═══════════════════════════════════════════════════════════════════════════
// NEW: Unified reward calculation system
// ═══════════════════════════════════════════════════════════════════════════

// Constants for the new reward system
const REWARD_CONSTANTS = {
  ALPHA: 0.25,            // Pot multiplier per additional goal
  CAP_POT_MULTIPLIER: 1.75, // Max pot = potBase * 1.75
  BETA: 0.35,             // Difficulty multiplier coefficient
  PE_REF: 20,             // Reference PE for difficulty calculation
  GAMMA: 0.10,            // Split adjustment coefficient
  // Neutral weights for unknown activity types
  NEUTRAL_WEIGHTS: { wKm: 0.5, wMin: 0.08, wSess: 0.7 },
};

/**
 * Count the number of active goals in a challenge
 * If multiGoals exists with active sub-goals, returns count of sub-goals
 * Otherwise returns 1
 */
const countGoals = (challenge) => {
  const mg = challenge?.multiGoals;
  if (!mg || typeof mg !== 'object') return 1;
  
  let count = 0;
  if (Number(mg.distance) > 0) count++;
  if (Number(mg.duration) > 0) count++;
  if (Number(mg.count) > 0) count++;
  
  return count > 0 ? count : 1;
};

/**
 * Calculate the pot based on stake and number of goals
 * pot = potBase * (1 + ALPHA * (nGoals - 1)), capped at potBase * CAP_POT_MULTIPLIER
 */
const calculatePot = (stake, nGoals) => {
  const potBase = stake * 2;
  const { ALPHA, CAP_POT_MULTIPLIER } = REWARD_CONSTANTS;
  const potMultiplier = 1 + ALPHA * (nGoals - 1);
  const cappedMultiplier = Math.min(potMultiplier, CAP_POT_MULTIPLIER);
  return Math.round(potBase * cappedMultiplier * 100) / 100;
};

/**
 * Estimate required effort points from challenge goals
 * Uses neutral weights when activity type is unknown
 */
const estimateRequiredEffortPointsFromChallengeGoals = (challenge) => {
  const { NEUTRAL_WEIGHTS } = REWARD_CONSTANTS;
  const { wKm, wMin, wSess } = NEUTRAL_WEIGHTS;
  
  let peRequired = 0;
  
  // Check multiGoals first
  const mg = challenge?.multiGoals;
  if (mg && typeof mg === 'object') {
    const distance = Number(mg.distance) || 0;
    const duration = Number(mg.duration) || 0;
    const count = Number(mg.count) || 0;
    
    peRequired += distance * wKm;
    peRequired += duration * wMin;
    peRequired += count * wSess;
  }
  
  // If no multiGoals, check the main goal
  if (peRequired === 0 && challenge?.goal) {
    const goalType = challenge.goal.type;
    const goalValue = Number(challenge.goal.value) || 0;
    
    switch (goalType) {
      case 'distance':
        peRequired = goalValue * wKm;
        break;
      case 'duration':
        peRequired = goalValue * wMin;
        break;
      case 'count':
        peRequired = goalValue * wSess;
        break;
      case 'effort_points':
        peRequired = goalValue;
        break;
      default:
        peRequired = 10; // Fallback
    }
  }
  
  // Fallback: ensure minimum PE of 1
  return Math.max(1, Math.round(peRequired * 100) / 100);
};

/**
 * Calculate difficulty multiplier based on PE required
 * Mdifficulty = 1 + BETA * log(1 + PE_required / PE_REF), clamped to [1.0, 1.35]
 */
const calculateDifficultyMultiplier = (peRequired) => {
  const { BETA, PE_REF } = REWARD_CONSTANTS;
  const mDifficulty = 1 + BETA * Math.log(1 + peRequired / PE_REF);
  return clamp(mDifficulty, 1.0, 1.35);
};

/**
 * Calculate performance multiplier based on progress and effort ratio
 * Mperf = 1.0 + 0.6p + 0.4*min(e, 1.0), clamped to [1.0, 2.0]
 */
const calculatePerformanceMultiplier = (progressRatio, effortRatio) => {
  const p = clamp(progressRatio, 0, 1);
  const e = clamp(effortRatio, 0, 1.5);
  const mPerf = 1.0 + 0.6 * p + 0.4 * Math.min(e, 1.0);
  return clamp(mPerf, 1.0, 2.0);
};

/**
 * Calculate effort-based split between two players
 * shareA = 0.5 + GAMMA * (PE_A - PE_B) / (PE_A + PE_B + epsilon), clamped to [0.45, 0.55]
 */
const calculateEffortSplit = (peA, peB) => {
  const { GAMMA } = REWARD_CONSTANTS;
  const denom = peA + peB + 1e-6;
  const shareA = 0.5 + GAMMA * (peA - peB) / denom;
  return {
    shareA: clamp(shareA, 0.45, 0.55),
    shareB: clamp(1 - shareA, 0.45, 0.55),
  };
};

/**
 * Pure function to compute all settlement amounts
 * This is the main testable function for the reward system
 * 
 * @param {Object} params
 * @param {number} params.stake - Stake per player (default 10)
 * @param {number} params.nGoals - Number of goals (1-3)
 * @param {number} params.peRequired - Estimated PE required from goals
 * @param {number} params.peA - Actual PE from player A
 * @param {number} params.peB - Actual PE from player B (0 for solo)
 * @param {number} params.progressRatio - Overall progress ratio (0-1)
 * @param {boolean} params.completed - Whether challenge was completed
 * @param {boolean} params.isSolo - Whether it's a solo challenge
 * @returns {Object} Settlement amounts
 */
const computeSettlementAmounts = ({
  stake = 10,
  nGoals = 1,
  peRequired = 10,
  peA = 0,
  peB = 0,
  progressRatio = 0,
  completed = false,
  isSolo = false,
}) => {
  const potBase = stake * 2;
  const pot = calculatePot(stake, nGoals);
  const pePair = peA + peB;
  const effortRatio = clamp(pePair / Math.max(peRequired, 1), 0, 1.5);
  
  const mDifficulty = calculateDifficultyMultiplier(peRequired);
  const mPerf = calculatePerformanceMultiplier(progressRatio, effortRatio);
  
  let gainTotal = pot * mDifficulty * mPerf;
  
  // Cap: gainTotal <= potBase * 3.0 (max 60 for stake=10)
  gainTotal = Math.min(gainTotal, potBase * 3.0);
  
  // If completed, ensure minimum gain of potBase * 1.2 (min 24 for stake=10)
  if (completed) {
    gainTotal = Math.max(gainTotal, potBase * 1.2);
  }
  
  // Round to whole number
  gainTotal = Math.round(gainTotal);
  
  if (completed) {
    // Success path
    if (isSolo) {
      return {
        success: true,
        gainTotal,
        gainA: gainTotal,
        gainB: 0,
        refundTotal: 0,
        burnTotal: 0,
        pot,
        mDifficulty: Math.round(mDifficulty * 1000) / 1000,
        mPerf: Math.round(mPerf * 1000) / 1000,
      };
    }
    
    // Duo: split based on effort
    const { shareA, shareB } = calculateEffortSplit(peA, peB);
    const gainA = Math.round(gainTotal * shareA);
    const gainB = gainTotal - gainA;
    
    return {
      success: true,
      gainTotal,
      gainA,
      gainB,
      refundTotal: 0,
      burnTotal: 0,
      pot,
      mDifficulty: Math.round(mDifficulty * 1000) / 1000,
      mPerf: Math.round(mPerf * 1000) / 1000,
      shareA: Math.round(shareA * 100) / 100,
      shareB: Math.round(shareB * 100) / 100,
    };
  }
  
  // Failure path: partial refund based on progress and effort
  const p = clamp(progressRatio, 0, 1);
  const e = Math.min(effortRatio, 1);
  const refundRatio = clamp(0.7 * p + 0.3 * e, 0, 1);
  
  // Refund is based on potBase (actual stakes), not pot
  const refundTotal = Math.round(potBase * refundRatio);
  const burnTotal = potBase - refundTotal;
  
  // Split refund 50/50 for simplicity
  const refundA = isSolo ? refundTotal : Math.round(refundTotal / 2);
  const refundB = isSolo ? 0 : refundTotal - refundA;
  
  return {
    success: false,
    gainTotal: 0,
    gainA: 0,
    gainB: 0,
    refundTotal,
    refundA,
    refundB,
    burnTotal,
    pot,
    mDifficulty: Math.round(mDifficulty * 1000) / 1000,
    mPerf: Math.round(mPerf * 1000) / 1000,
    refundRatio: Math.round(refundRatio * 100) / 100,
  };
};

/**
 * Estimate potential gain for UI display
 * Shows range based on number of goals (min = base success, max = with multipliers)
 */
const estimatePotentialGain = (stake = 10, nGoals = 1) => {
  const potBase = stake * 2;
  const pot = calculatePot(stake, nGoals);
  
  // Min gain (completed with low performance): pot * 1.0 * 1.0 but at least potBase * 1.2
  const minGain = Math.round(Math.max(pot, potBase * 1.2));
  
  // Max gain: pot * 1.35 * 2.0, capped at potBase * 3.0
  const maxGain = Math.round(Math.min(pot * 1.35 * 2.0, potBase * 3.0));
  
  return { minGain, maxGain, pot };
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
  // New unified reward system
  REWARD_CONSTANTS,
  countGoals,
  calculatePot,
  estimateRequiredEffortPointsFromChallengeGoals,
  calculateDifficultyMultiplier,
  calculatePerformanceMultiplier,
  calculateEffortSplit,
  computeSettlementAmounts,
  estimatePotentialGain,
};
