// server/__tests__/unifiedSettlement.test.js
// Tests for the new unified settlement system

const helpers = require('../services/challenge/helpers');

const {
  countGoals,
  calculatePot,
  estimateRequiredEffortPointsFromChallengeGoals,
  calculateDifficultyMultiplier,
  calculatePerformanceMultiplier,
  calculateEffortSplit,
  computeSettlementAmounts,
  estimatePotentialGain,
  REWARD_CONSTANTS,
} = helpers;

describe('Unified Settlement System', () => {
  // ════════════════════════════════════════════════════════════════════════════
  // countGoals tests
  // ════════════════════════════════════════════════════════════════════════════
  describe('countGoals', () => {
    it('returns 1 when no multiGoals', () => {
      expect(countGoals({})).toBe(1);
      expect(countGoals({ multiGoals: null })).toBe(1);
      expect(countGoals({ multiGoals: {} })).toBe(1);
    });

    it('counts active multiGoals correctly', () => {
      expect(countGoals({ multiGoals: { distance: 10 } })).toBe(1);
      expect(countGoals({ multiGoals: { distance: 10, duration: 30 } })).toBe(2);
      expect(countGoals({ multiGoals: { distance: 10, duration: 30, count: 5 } })).toBe(3);
    });

    it('ignores zero or null values', () => {
      expect(countGoals({ multiGoals: { distance: 0, duration: 30 } })).toBe(1);
      expect(countGoals({ multiGoals: { distance: null, duration: 30, count: 0 } })).toBe(1);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // calculatePot tests
  // ════════════════════════════════════════════════════════════════════════════
  describe('calculatePot', () => {
    it('returns potBase (stake*2) for nGoals=1', () => {
      expect(calculatePot(10, 1)).toBe(20);
    });

    it('increases pot with more goals (ALPHA=0.25)', () => {
      // nGoals=2: pot = 20 * (1 + 0.25 * 1) = 20 * 1.25 = 25
      expect(calculatePot(10, 2)).toBe(25);
      // nGoals=3: pot = 20 * (1 + 0.25 * 2) = 20 * 1.5 = 30
      expect(calculatePot(10, 3)).toBe(30);
    });

    it('caps pot at potBase * 1.75', () => {
      // nGoals=4 would be 20 * (1 + 0.25 * 3) = 20 * 1.75 = 35 (at cap)
      expect(calculatePot(10, 4)).toBe(35);
      // nGoals=10 would exceed cap, should be capped at 35
      expect(calculatePot(10, 10)).toBe(35);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // estimateRequiredEffortPointsFromChallengeGoals tests
  // ════════════════════════════════════════════════════════════════════════════
  describe('estimateRequiredEffortPointsFromChallengeGoals', () => {
    const { NEUTRAL_WEIGHTS } = REWARD_CONSTANTS;
    const { wKm, wMin, wSess } = NEUTRAL_WEIGHTS;

    it('calculates PE from multiGoals using neutral weights', () => {
      const challenge = {
        multiGoals: { distance: 10, duration: 60, count: 5 },
      };
      // PE = 10*0.5 + 60*0.08 + 5*0.7 = 5 + 4.8 + 3.5 = 13.3
      expect(estimateRequiredEffortPointsFromChallengeGoals(challenge)).toBeCloseTo(13.3, 1);
    });

    it('falls back to main goal if no multiGoals', () => {
      const challenge = {
        goal: { type: 'distance', value: 20 },
      };
      // PE = 20 * 0.5 = 10
      expect(estimateRequiredEffortPointsFromChallengeGoals(challenge)).toBe(10);
    });

    it('handles effort_points goal type directly', () => {
      const challenge = {
        goal: { type: 'effort_points', value: 35 },
      };
      expect(estimateRequiredEffortPointsFromChallengeGoals(challenge)).toBe(35);
    });

    it('returns minimum of 1 for empty challenge', () => {
      expect(estimateRequiredEffortPointsFromChallengeGoals({})).toBe(1);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // calculateDifficultyMultiplier tests
  // ════════════════════════════════════════════════════════════════════════════
  describe('calculateDifficultyMultiplier', () => {
    it('returns ~1.0 for very low PE', () => {
      expect(calculateDifficultyMultiplier(0)).toBeCloseTo(1.0, 2);
      expect(calculateDifficultyMultiplier(1)).toBeCloseTo(1.02, 1);
    });

    it('returns ~1.24 for PE_REF=20', () => {
      // M = 1 + 0.35 * ln(2) ≈ 1 + 0.35 * 0.693 ≈ 1.243
      expect(calculateDifficultyMultiplier(20)).toBeCloseTo(1.24, 1);
    });

    it('caps at 1.35 for very high PE', () => {
      expect(calculateDifficultyMultiplier(100)).toBeLessThanOrEqual(1.35);
      expect(calculateDifficultyMultiplier(1000)).toBe(1.35);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // calculatePerformanceMultiplier tests
  // ════════════════════════════════════════════════════════════════════════════
  describe('calculatePerformanceMultiplier', () => {
    it('returns 1.0 for zero progress and effort', () => {
      expect(calculatePerformanceMultiplier(0, 0)).toBe(1.0);
    });

    it('returns 2.0 for perfect progress and effort', () => {
      expect(calculatePerformanceMultiplier(1.0, 1.0)).toBe(2.0);
    });

    it('handles partial values correctly', () => {
      // Mperf = 1.0 + 0.6*0.5 + 0.4*0.5 = 1.0 + 0.3 + 0.2 = 1.5
      expect(calculatePerformanceMultiplier(0.5, 0.5)).toBe(1.5);
    });

    it('clamps effort ratio at 1.0 for calculation', () => {
      // e=1.5 but uses min(e, 1.0)=1.0
      // Mperf = 1.0 + 0.6*1.0 + 0.4*1.0 = 2.0
      expect(calculatePerformanceMultiplier(1.0, 1.5)).toBe(2.0);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // calculateEffortSplit tests
  // ════════════════════════════════════════════════════════════════════════════
  describe('calculateEffortSplit', () => {
    it('returns 50/50 for equal effort', () => {
      const { shareA, shareB } = calculateEffortSplit(10, 10);
      expect(shareA).toBe(0.5);
      expect(shareB).toBe(0.5);
    });

    it('favors player with more effort within bounds', () => {
      const { shareA, shareB } = calculateEffortSplit(20, 10);
      expect(shareA).toBeGreaterThan(0.5);
      expect(shareA).toBeLessThanOrEqual(0.55);
      expect(shareB).toBeLessThan(0.5);
      expect(shareB).toBeGreaterThanOrEqual(0.45);
    });

    it('clamps to [0.45, 0.55] even with extreme differences', () => {
      const { shareA, shareB } = calculateEffortSplit(100, 1);
      expect(shareA).toBe(0.55);
      expect(shareB).toBe(0.45);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // computeSettlementAmounts tests - SUCCESS CASES
  // ════════════════════════════════════════════════════════════════════════════
  describe('computeSettlementAmounts - Success', () => {
    it('nGoals=1 success returns gain around 30-40', () => {
      const result = computeSettlementAmounts({
        stake: 10,
        nGoals: 1,
        peRequired: 10,
        peA: 10,
        peB: 10,
        progressRatio: 1.0,
        completed: true,
        isSolo: false,
      });

      expect(result.success).toBe(true);
      expect(result.gainTotal).toBeGreaterThanOrEqual(24); // min potBase*1.2
      expect(result.gainTotal).toBeLessThanOrEqual(60);    // max potBase*3.0
      expect(result.refundTotal).toBe(0);
      expect(result.burnTotal).toBe(0);
    });

    it('nGoals=3 success can exceed 40 but caps at 60', () => {
      const result = computeSettlementAmounts({
        stake: 10,
        nGoals: 3,
        peRequired: 30,
        peA: 40,
        peB: 40,
        progressRatio: 1.0,
        completed: true,
        isSolo: false,
      });

      expect(result.success).toBe(true);
      // pot = 30, with multipliers can be higher than 40
      expect(result.gainTotal).toBeGreaterThan(35);
      expect(result.gainTotal).toBeLessThanOrEqual(60);
    });

    it('solo success gives all gain to player A', () => {
      const result = computeSettlementAmounts({
        stake: 10,
        nGoals: 1,
        peRequired: 10,
        peA: 15,
        peB: 0,
        progressRatio: 1.0,
        completed: true,
        isSolo: true,
      });

      expect(result.success).toBe(true);
      expect(result.gainA).toBe(result.gainTotal);
      expect(result.gainB).toBe(0);
    });

    it('split respects [45%, 55%] bounds', () => {
      // Player A with much more effort
      const result1 = computeSettlementAmounts({
        stake: 10,
        nGoals: 1,
        peRequired: 10,
        peA: 50,
        peB: 5,
        progressRatio: 1.0,
        completed: true,
        isSolo: false,
      });

      const shareA = result1.gainA / result1.gainTotal;
      expect(shareA).toBeCloseTo(0.55, 1);

      // Player B with more effort
      const result2 = computeSettlementAmounts({
        stake: 10,
        nGoals: 1,
        peRequired: 10,
        peA: 5,
        peB: 50,
        progressRatio: 1.0,
        completed: true,
        isSolo: false,
      });

      const shareB = result2.gainB / result2.gainTotal;
      expect(shareB).toBeCloseTo(0.55, 1);
    });

    it('ensures minimum gain of 24 for success', () => {
      const result = computeSettlementAmounts({
        stake: 10,
        nGoals: 1,
        peRequired: 100, // High PE requirement
        peA: 1,          // Very low PE achieved
        peB: 1,
        progressRatio: 1.0, // But somehow completed
        completed: true,
        isSolo: false,
      });

      expect(result.success).toBe(true);
      expect(result.gainTotal).toBeGreaterThanOrEqual(24);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // computeSettlementAmounts tests - FAILURE CASES
  // ════════════════════════════════════════════════════════════════════════════
  describe('computeSettlementAmounts - Failure', () => {
    it('p=0 e=0 failure returns refund=0 burn=20', () => {
      const result = computeSettlementAmounts({
        stake: 10,
        nGoals: 1,
        peRequired: 10,
        peA: 0,
        peB: 0,
        progressRatio: 0,
        completed: false,
        isSolo: false,
      });

      expect(result.success).toBe(false);
      expect(result.gainTotal).toBe(0);
      expect(result.refundTotal).toBe(0);
      expect(result.burnTotal).toBe(20);
    });

    it('p=0.5 failure returns partial refund', () => {
      const result = computeSettlementAmounts({
        stake: 10,
        nGoals: 1,
        peRequired: 10,
        peA: 5,
        peB: 5,
        progressRatio: 0.5,
        completed: false,
        isSolo: false,
      });

      expect(result.success).toBe(false);
      // refundRatio = 0.7*0.5 + 0.3*min(1.0, 1.0) = 0.35 + 0.3 = 0.65
      // refundTotal = 20 * 0.65 = 13
      expect(result.refundTotal).toBeCloseTo(13, 0);
      expect(result.burnTotal).toBeCloseTo(7, 0);
    });

    it('high effort but no completion still gives partial refund', () => {
      const result = computeSettlementAmounts({
        stake: 10,
        nGoals: 1,
        peRequired: 10,
        peA: 15,
        peB: 15,
        progressRatio: 0.8,
        completed: false,
        isSolo: false,
      });

      expect(result.success).toBe(false);
      // refundRatio = 0.7*0.8 + 0.3*1.0 = 0.56 + 0.3 = 0.86
      // refundTotal = 20 * 0.86 = 17 (rounded)
      expect(result.refundTotal).toBeCloseTo(17, 0);
      expect(result.burnTotal).toBeCloseTo(3, 0);
    });

    it('solo failure refunds to player A only', () => {
      const result = computeSettlementAmounts({
        stake: 10,
        nGoals: 1,
        peRequired: 10,
        peA: 5,
        peB: 0,
        progressRatio: 0.5,
        completed: false,
        isSolo: true,
      });

      expect(result.success).toBe(false);
      expect(result.refundA).toBe(result.refundTotal);
      expect(result.refundB).toBe(0);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // estimatePotentialGain tests
  // ════════════════════════════════════════════════════════════════════════════
  describe('estimatePotentialGain', () => {
    it('returns correct range for nGoals=1', () => {
      const { minGain, maxGain, pot } = estimatePotentialGain(10, 1);
      expect(pot).toBe(20);
      expect(minGain).toBeGreaterThanOrEqual(20);
      expect(maxGain).toBeLessThanOrEqual(60);
    });

    it('increases pot and max gain with more goals', () => {
      const g1 = estimatePotentialGain(10, 1);
      const g3 = estimatePotentialGain(10, 3);
      
      expect(g3.pot).toBeGreaterThan(g1.pot);
      expect(g3.maxGain).toBeGreaterThan(g1.maxGain);
    });

    it('caps maximum at potBase * 3.0 = 60', () => {
      const { maxGain } = estimatePotentialGain(10, 3);
      expect(maxGain).toBeLessThanOrEqual(60);
    });
  });
});
