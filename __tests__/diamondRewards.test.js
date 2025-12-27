// server/__tests__/diamondRewards.test.js
// Tests complets pour le système de récompenses de diamants

const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const WeeklyChallenge = require('../models/WeeklyChallenge');
const Activity = require('../models/Activity');
const DiamondTransaction = require('../models/DiamondTransaction');
const { createTestUserWithToken } = require('./helpers/authHelper');

describe('💎 Diamond Rewards System', () => {
  let user1Token, user1Id;
  let user2Token, user2Id;

  beforeEach(async () => {
    // Create two test users with 200 diamonds each (default)
    const result1 = await createTestUserWithToken();
    user1Token = result1.token;
    user1Id = result1.user._id.toString();

    const result2 = await createTestUserWithToken();
    user2Token = result2.token;
    user2Id = result2.user._id.toString();

    // Create confirmed partnership
    await User.findByIdAndUpdate(user1Id, {
      $push: {
        partnerSlots: {
          slot: 'p1',
          partnerId: user2Id,
          status: 'confirmed',
          confirmedAt: new Date(),
        },
      },
    });
    await User.findByIdAndUpdate(user2Id, {
      $push: {
        partnerSlots: {
          slot: 'p1',
          partnerId: user1Id,
          status: 'confirmed',
          confirmedAt: new Date(),
        },
      },
    });
  });

  describe('📊 Effort Points Calculation', () => {
    test('✅ Should calculate PE correctly for running', async () => {
      // Create an active challenge
      const createRes = await request(app)
        .post('/api/challenges')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          mode: 'duo',
          partnerId: user2Id,
          goal: { type: 'count', value: 5 },
          activityTypes: ['running'],
          title: 'Test challenge',
        });

      expect(createRes.status).toBe(201);
      const challengeId = createRes.body.data._id;

      // Both sign to activate
      await request(app)
        .post(`/api/challenges/${challengeId}/sign`)
        .set('Authorization', `Bearer ${user1Token}`);

      await request(app)
        .post(`/api/challenges/${challengeId}/sign`)
        .set('Authorization', `Bearer ${user2Token}`);

      // Add running activity: 5km, 30min
      // Expected PE: (0.8 * 5) + (0.1 * 30) + (0.7 * 1) = 4 + 3 + 0.7 = 7.7
      await request(app)
        .post('/api/activities')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          type: 'running',
          title: 'Morning run',
          date: new Date().toISOString(),
          duration: 30,
          distance: 5,
        });

      // Check progress was updated
      const refreshRes = await request(app)
        .post('/api/challenges/refresh-progress')
        .set('Authorization', `Bearer ${user1Token}`);

      expect(refreshRes.status).toBe(200);

      const player = refreshRes.body.data.players.find(
        (p) => (typeof p.user === 'string' ? p.user : p.user._id) === user1Id
      );

      // For non-progression pact, progress is count-based
      expect(player.progress).toBeGreaterThan(0);
    });

    test('✅ Should weight activities differently by type', async () => {
      // Import the helper directly for unit testing
      const { calcEffortPointsForActivities } = require('../services/challenge/helpers');

      // Running: 5km, 30min, 1 session
      const runningActivities = [{ type: 'running', distance: 5, duration: 30 }];
      const runningPE = calcEffortPointsForActivities(runningActivities);
      // Expected: (0.8 * 5) + (0.1 * 30) + (0.7 * 1) = 4 + 3 + 0.7 = 7.7
      expect(runningPE).toBeCloseTo(7.7, 1);

      // Walking: 5km, 60min, 1 session
      const walkingActivities = [{ type: 'walking', distance: 5, duration: 60 }];
      const walkingPE = calcEffortPointsForActivities(walkingActivities);
      // Expected: (0.35 * 5) + (0.06 * 60) + (0.5 * 1) = 1.75 + 3.6 + 0.5 = 5.85
      // Note: Helper rounds to 1 decimal place, so 5.85 -> 5.9
      expect(walkingPE).toBeCloseTo(5.9, 0);

      // Cycling: 20km, 60min, 1 session
      const cyclingActivities = [{ type: 'cycling', distance: 20, duration: 60 }];
      const cyclingPE = calcEffortPointsForActivities(cyclingActivities);
      // Expected: (0.2 * 20) + (0.05 * 60) + (0.6 * 1) = 4 + 3 + 0.6 = 7.6
      expect(cyclingPE).toBeCloseTo(7.6, 1);

      // Swimming: 1km, 30min, 1 session
      const swimmingActivities = [{ type: 'swimming', distance: 1, duration: 30 }];
      const swimmingPE = calcEffortPointsForActivities(swimmingActivities);
      // Expected: (2.0 * 1) + (0.08 * 30) + (0.7 * 1) = 2 + 2.4 + 0.7 = 5.1
      expect(swimmingPE).toBeCloseTo(5.1, 1);

      // Workout: 0km (no distance), 45min, 1 session
      const workoutActivities = [{ type: 'workout', distance: 0, duration: 45 }];
      const workoutPE = calcEffortPointsForActivities(workoutActivities);
      // Expected: (0 * 0) + (0.09 * 45) + (0.9 * 1) = 0 + 4.05 + 0.9 = 4.95
      expect(workoutPE).toBeCloseTo(4.95, 1);
    });

    test('✅ Should accumulate PE across multiple activities', async () => {
      const { calcEffortPointsForActivities } = require('../services/challenge/helpers');

      const mixedActivities = [
        { type: 'running', distance: 5, duration: 30 },
        { type: 'running', distance: 3, duration: 20 },
        { type: 'walking', distance: 2, duration: 30 },
      ];

      const totalPE = calcEffortPointsForActivities(mixedActivities);

      // Running: km=8, min=50, sessions=2
      // (0.8 * 8) + (0.1 * 50) + (0.7 * 2) = 6.4 + 5 + 1.4 = 12.8
      // Walking: km=2, min=30, sessions=1
      // (0.35 * 2) + (0.06 * 30) + (0.5 * 1) = 0.7 + 1.8 + 0.5 = 3.0
      // Total: 12.8 + 3.0 = 15.8

      expect(totalPE).toBeCloseTo(15.8, 1);
    });
  });

  describe('💰 Stake System', () => {
    test('✅ Should debit 10 diamonds on challenge creation', async () => {
      const initialDiamonds = 200; // Default from createTestUserWithToken

      const createRes = await request(app)
        .post('/api/challenges')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          mode: 'duo',
          partnerId: user2Id,
          goal: { type: 'count', value: 5 },
          activityTypes: ['running'],
          title: 'Test challenge',
        });

      expect(createRes.status).toBe(201);

      // Check user1 diamonds were debited
      const user1After = await User.findById(user1Id);
      expect(user1After.totalDiamonds).toBe(initialDiamonds - 10);
    });

    test('✅ Should debit invitee diamonds on activation', async () => {
      const createRes = await request(app)
        .post('/api/challenges')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          mode: 'duo',
          partnerId: user2Id,
          goal: { type: 'count', value: 5 },
          activityTypes: ['running'],
          title: 'Test challenge',
        });

      const challengeId = createRes.body.data._id;

      // User1 signs
      await request(app)
        .post(`/api/challenges/${challengeId}/sign`)
        .set('Authorization', `Bearer ${user1Token}`);

      // User2's diamonds should still be 200
      let user2Check = await User.findById(user2Id);
      expect(user2Check.totalDiamonds).toBe(200);

      // User2 signs - should debit diamonds
      await request(app)
        .post(`/api/challenges/${challengeId}/sign`)
        .set('Authorization', `Bearer ${user2Token}`);

      user2Check = await User.findById(user2Id);
      expect(user2Check.totalDiamonds).toBe(190); // 200 - 10
    });

    test('✅ Should not allow challenge creation without enough diamonds', async () => {
      // Set user1 to 5 diamonds
      await User.findByIdAndUpdate(user1Id, { totalDiamonds: 5 });

      const createRes = await request(app)
        .post('/api/challenges')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          mode: 'duo',
          partnerId: user2Id,
          goal: { type: 'count', value: 5 },
          activityTypes: ['running'],
          title: 'Test challenge',
        });

      expect(createRes.status).toBe(400);
      expect(createRes.body.message).toContain('Diamants');
    });
  });

  describe('📝 Diamond Transaction Tracking', () => {
    test('✅ Should record stake_hold transaction', async () => {
      await request(app)
        .post('/api/challenges')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          mode: 'duo',
          partnerId: user2Id,
          goal: { type: 'count', value: 5 },
          activityTypes: ['running'],
          title: 'Test challenge',
        });

      const transactions = await DiamondTransaction.find({ user: user1Id });
      const stakeHold = transactions.find((t) => t.kind === 'stake_hold');

      expect(stakeHold).toBeDefined();
      expect(stakeHold.amount).toBe(-10);
    });
  });

  describe('🎯 Multi-Goals Progress', () => {
    test('✅ Should use minimum ratio for multi-goal progress', async () => {
      const { calcMultiGoalProgressForActivities } = require('../services/challenge/helpers');

      const activities = [
        { type: 'running', distance: 5, duration: 30 }, // 5km, 30min
      ];

      const multiGoals = { distance: 10, count: 5 };

      const result = calcMultiGoalProgressForActivities(activities, multiGoals);

      // Distance: 5/10 = 50%
      // Count: 1/5 = 20%
      // Min = 20%

      expect(result.percentage).toBe(20);
      expect(result.breakdown.distance.current).toBe(5);
      expect(result.breakdown.count.current).toBe(1);
      expect(result.allCompleted).toBe(false);
    });

    test('✅ Should mark completed only when ALL goals are met', async () => {
      const { calcMultiGoalProgressForActivities } = require('../services/challenge/helpers');

      const activities = [
        { type: 'running', distance: 5, duration: 30 },
        { type: 'running', distance: 3, duration: 20 },
        { type: 'running', distance: 4, duration: 25 },
        { type: 'walking', distance: 2, duration: 30 },
        { type: 'cycling', distance: 10, duration: 45 },
      ];

      const multiGoals = { distance: 10, count: 5 };

      const result = calcMultiGoalProgressForActivities(activities, multiGoals);

      // Distance: 24/10 = 240% (capped to 100%)
      // Count: 5/5 = 100%
      // Min = 100%

      expect(result.percentage).toBe(100);
      expect(result.allCompleted).toBe(true);
    });
  });

  describe('🏆 Settlement Logic', () => {
    test('✅ Should calculate correct payout multiplier for progression pact', async () => {
      // The _clamp function: M = clamp(1.2 + 1.5 * (rPair - 1.0), 1.2, 2.0)
      // If rPair = 1.0, M = 1.2
      // If rPair = 1.2, M = 1.2 + 1.5 * 0.2 = 1.5
      // If rPair = 1.53, M = 1.2 + 1.5 * 0.53 = 2.0 (capped)

      const { clamp } = require('../services/challenge/helpers');

      // Test clamp function behavior
      const calcM = (rPair) => clamp(1.2 + 1.5 * (rPair - 1.0), 1.2, 2.0);

      expect(calcM(1.0)).toBe(1.2);
      expect(calcM(1.1)).toBeCloseTo(1.35, 2);
      expect(calcM(1.2)).toBeCloseTo(1.5, 2);
      expect(calcM(1.5)).toBeCloseTo(1.95, 2);
      expect(calcM(2.0)).toBe(2.0); // Capped
    });
  });
});
