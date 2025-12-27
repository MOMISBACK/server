// server/__tests__/multiGoals.test.js
// Tests for multi-goals (progression pact) feature
// Covers: creation, counter-proposal, persistence, and progress calculation

const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../models/User');
const WeeklyChallenge = require('../models/WeeklyChallenge');
const Activity = require('../models/Activity');
const PartnerInvite = require('../models/PartnerInvite');
const { createTestUserWithToken } = require('./helpers/authHelper');

let user1Token, user1Id;
let user2Token, user2Id;

beforeEach(async () => {
  // Create two test users for DUO challenges
  const result1 = await createTestUserWithToken({ email: 'user1@test.com' });
  user1Token = result1.token;
  user1Id = result1.user._id.toString();

  const result2 = await createTestUserWithToken({ email: 'user2@test.com' });
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

afterAll(async () => {
  await mongoose.connection.close();
}, 10000);

const createTestApp = () => {
  const express = require('express');
  const app = express();
  app.use(express.json());

  const challengeRoutes = require('../routes/challengeRoutes');
  const activityRoutes = require('../routes/activityRoutes');
  app.use('/api/challenges', challengeRoutes);
  app.use('/api/activities', activityRoutes);

  return app;
};

describe('🎯 Multi-Goals Feature', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  describe('Creation', () => {
    test('✅ Should create DUO challenge with multiGoals (distance + count)', async () => {
      const res = await request(app)
        .post('/api/challenges')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          mode: 'duo',
          partnerId: user2Id,
          goal: { type: 'count', value: 100 }, // Placeholder goal
          activityTypes: ['running'],
          title: '10 km + 5 séances',
          multiGoals: {
            distance: 10,
            count: 5,
          },
          pactRules: 'progression_7d_v1',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.pactRules).toBe('progression_7d_v1');
      expect(res.body.data.multiGoals).toBeDefined();
      expect(res.body.data.multiGoals.distance).toBe(10);
      expect(res.body.data.multiGoals.count).toBe(5);
      // Values should NOT be multiplied
      expect(res.body.data.multiGoals.distance).not.toBe(50); // 10 * 5
      expect(res.body.data.multiGoals.count).not.toBe(50);
    });

    test('✅ Should create DUO challenge with multiGoals (distance + duration)', async () => {
      const res = await request(app)
        .post('/api/challenges')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          mode: 'duo',
          partnerId: user2Id,
          goal: { type: 'count', value: 100 },
          activityTypes: ['running', 'cycling'],
          title: '50 km + 300 min',
          multiGoals: {
            distance: 50,
            duration: 300,
          },
          pactRules: 'progression_7d_v1',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.multiGoals.distance).toBe(50);
      expect(res.body.data.multiGoals.duration).toBe(300);
    });

    test('✅ Should require at least 2 sub-goals for progression_7d_v1', async () => {
      const res = await request(app)
        .post('/api/challenges')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          mode: 'duo',
          partnerId: user2Id,
          goal: { type: 'count', value: 100 },
          activityTypes: ['running'],
          title: 'Only distance',
          multiGoals: {
            distance: 10,
            // Only 1 sub-goal
          },
          pactRules: 'progression_7d_v1',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/2.*sous-objectifs/i);
    });

    test('✅ Should preserve individual values (no multiplication bug)', async () => {
      const res = await request(app)
        .post('/api/challenges')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          mode: 'duo',
          partnerId: user2Id,
          goal: { type: 'count', value: 100 },
          activityTypes: ['running'],
          title: '4 km + 5 séances',
          multiGoals: {
            distance: 4,
            count: 5,
          },
          pactRules: 'progression_7d_v1',
        });

      expect(res.status).toBe(201);

      // Fetch the challenge to verify stored values
      const challenge = await WeeklyChallenge.findById(res.body.data._id);
      expect(challenge.multiGoals.distance).toBe(4);
      expect(challenge.multiGoals.count).toBe(5);
      // CRITICAL: Values should NOT be multiplied (4 * 5 = 20 would be wrong)
      expect(challenge.multiGoals.distance).not.toBe(20);
      expect(challenge.multiGoals.count).not.toBe(20);
    });
  });

  describe('Counter-Proposal', () => {
    let pendingChallengeId;

    beforeEach(async () => {
      // Create a pending DUO challenge with multiGoals
      const createRes = await request(app)
        .post('/api/challenges')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          mode: 'duo',
          partnerId: user2Id,
          goal: { type: 'count', value: 100 },
          activityTypes: ['running'],
          title: '10 km + 5 séances',
          multiGoals: {
            distance: 10,
            count: 5,
          },
          pactRules: 'progression_7d_v1',
          recurrence: {
            enabled: true,
            weeksCount: 4,
          },
        });

      pendingChallengeId = createRes.body.data._id;
    });

    test('✅ Counter-proposal should preserve multiGoals', async () => {
      const res = await request(app)
        .put(`/api/challenges/${pendingChallengeId}/propose`)
        .set('Authorization', `Bearer ${user2Token}`)
        .send({
          goal: { type: 'count', value: 100 },
          activityTypes: ['running'],
          title: '15 km + 7 séances',
          multiGoals: {
            distance: 15,
            count: 7,
          },
          pactRules: 'progression_7d_v1',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.multiGoals.distance).toBe(15);
      expect(res.body.data.multiGoals.count).toBe(7);
    });

    test('✅ Counter-proposal should preserve recurrence', async () => {
      const res = await request(app)
        .put(`/api/challenges/${pendingChallengeId}/propose`)
        .set('Authorization', `Bearer ${user2Token}`)
        .send({
          goal: { type: 'count', value: 100 },
          activityTypes: ['running'],
          title: '10 km + 5 séances',
          multiGoals: {
            distance: 10,
            count: 5,
          },
          pactRules: 'progression_7d_v1',
          recurrence: {
            enabled: true,
            weeksCount: 8, // Changed from 4 to 8
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.data.recurrence).toBeDefined();
      expect(res.body.data.recurrence.enabled).toBe(true);
      expect(res.body.data.recurrence.weeksCount).toBe(8);
    });

    test('✅ Counter-proposal should increment invitationVersion', async () => {
      // Get original version
      const originalChallenge = await WeeklyChallenge.findById(pendingChallengeId);
      const originalVersion = originalChallenge.invitationVersion || 1;

      const res = await request(app)
        .put(`/api/challenges/${pendingChallengeId}/propose`)
        .set('Authorization', `Bearer ${user2Token}`)
        .send({
          goal: { type: 'count', value: 100 },
          activityTypes: ['running'],
          title: 'Modified',
          multiGoals: {
            distance: 20,
            count: 10,
          },
          pactRules: 'progression_7d_v1',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.invitationVersion).toBe(originalVersion + 1);
    });
  });

  describe('Progress Calculation', () => {
    test('✅ Should calculate progress correctly for multi-goals', async () => {
      // Create active DUO challenge with multiGoals (need partner to accept first)
      const createRes = await request(app)
        .post('/api/challenges')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          mode: 'duo',
          partnerId: user2Id,
          goal: { type: 'count', value: 100 },
          activityTypes: ['running'],
          title: '10 km + 5 séances',
          multiGoals: {
            distance: 10,
            count: 5,
          },
          pactRules: 'progression_7d_v1',
        });

      expect(createRes.status).toBe(201);
      const challengeId = createRes.body.data._id;

      // User1 signs
      await request(app)
        .post(`/api/challenges/${challengeId}/sign`)
        .set('Authorization', `Bearer ${user1Token}`);

      // User2 signs to activate the challenge
      const signRes = await request(app)
        .post(`/api/challenges/${challengeId}/sign`)
        .set('Authorization', `Bearer ${user2Token}`);

      expect(signRes.status).toBe(200);
      expect(signRes.body.data.status).toBe('active');

      // Add an activity for user1
      const actRes = await request(app)
        .post('/api/activities')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          type: 'running',
          title: 'Morning run',
          date: new Date().toISOString(),
          duration: 30,
          distance: 5, // 5 km out of 10
        });

      expect(actRes.status).toBe(201);

      // Refresh progress
      const refreshRes = await request(app)
        .post('/api/challenges/refresh-progress')
        .set('Authorization', `Bearer ${user1Token}`);

      expect(refreshRes.status).toBe(200);

      const player = refreshRes.body.data.players.find(
        (p) => (typeof p.user === 'string' ? p.user : p.user._id) === user1Id
      );

      // multiGoalProgress should be defined for progression pacts
      expect(player.multiGoalProgress).toBeDefined();
      
      // Check that progress is calculated
      // Distance: 5/10 = 50%, Count: 1/5 = 20%
      // Progress is based on minimum ratio = 20%
      expect(player.multiGoalProgress.distance).toBeDefined();
      expect(player.multiGoalProgress.count).toBeDefined();
      expect(player.multiGoalProgress.distance.current).toBe(5);
      expect(player.multiGoalProgress.count.current).toBe(1);
    });
  });
});

describe('📆 Recurrence Persistence', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  test('✅ Recurrence should be preserved after challenge creation', async () => {
    const res = await request(app)
      .post('/api/challenges')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({
        mode: 'duo',
        partnerId: user2Id,
        goal: { type: 'distance', value: 50 },
        activityTypes: ['running'],
        title: '50 km',
        recurrence: {
          enabled: true,
          weeksCount: 12,
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.data.recurrence).toBeDefined();
    expect(res.body.data.recurrence.enabled).toBe(true);
    expect(res.body.data.recurrence.weeksCount).toBe(12);
  });

  test('✅ GET /current should return recurrence data', async () => {
    await request(app)
      .post('/api/challenges')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({
        mode: 'solo',
        goal: { type: 'distance', value: 50 },
        activityTypes: ['running'],
        title: '50 km solo',
        recurrence: {
          enabled: true,
          weeksCount: 6,
        },
      });

    const getRes = await request(app)
      .get('/api/challenges/current')
      .set('Authorization', `Bearer ${user1Token}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.recurrence.enabled).toBe(true);
    expect(getRes.body.data.recurrence.weeksCount).toBe(6);
  });
});
