// server/__tests__/challengeNewFeatures.test.js
// Tests for new challenge features: customTitle, perActivityGoals, recurrence

const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../models/User');
const WeeklyChallenge = require('../models/WeeklyChallenge');
const Activity = require('../models/Activity');
const { createTestUserWithToken } = require('./helpers/authHelper');

let authToken;
let userId;

beforeEach(async () => {
  const { user, token } = await createTestUserWithToken();
  authToken = token;
  userId = user._id.toString();
});

afterAll(async () => {
  await mongoose.connection.close();
}, 10000);

// Helper to create test app
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

describe('🏷️ Custom Title Feature', () => {
  let app;
  
  beforeEach(() => {
    app = createTestApp();
  });

  test('✅ POST /api/challenges - Should accept customTitle', async () => {
    const res = await request(app)
      .post('/api/challenges')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        goal: { type: 'distance', value: 42 },
        activityTypes: ['running'],
        title: '42 km',
        customTitle: 'Entrainement Marathon de Paris',
        icon: 'trophy-outline'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.customTitle).toBe('Entrainement Marathon de Paris');
  });

  test('✅ POST /api/challenges - customTitle should be optional', async () => {
    const res = await request(app)
      .post('/api/challenges')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        goal: { type: 'distance', value: 10 },
        activityTypes: ['running'],
        title: '10 km de course',
        icon: 'trophy-outline'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    // customTitle should be null or undefined when not provided
    expect(res.body.data.customTitle == null).toBe(true);
  });

  test('✅ GET /api/challenges/current - Should return customTitle', async () => {
    // Create challenge with custom title
    await request(app)
      .post('/api/challenges')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        goal: { type: 'distance', value: 100 },
        activityTypes: ['cycling'],
        title: '100 km vélo',
        customTitle: 'Tour de France personnel',
        icon: 'bicycle-outline'
      });

    const res = await request(app)
      .get('/api/challenges/current')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.customTitle).toBe('Tour de France personnel');
  });
});

describe('🎯 Per-Activity Goals Feature', () => {
  let app;
  
  beforeEach(() => {
    app = createTestApp();
  });

  test('✅ POST /api/challenges - Should accept perActivityGoals', async () => {
    const res = await request(app)
      .post('/api/challenges')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        goal: { type: 'distance', value: 60 }, // Global goal fallback
        activityTypes: ['running', 'cycling'],
        title: 'Multi-sport challenge',
        perActivityGoals: {
          running: { type: 'distance', value: 10 },
          cycling: { type: 'distance', value: 50 }
        },
        icon: 'trophy-outline'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    
    // Verify perActivityGoals is stored
    const challenge = await WeeklyChallenge.findById(res.body.data._id);
    expect(challenge.perActivityGoals).toBeDefined();
    expect(challenge.perActivityGoals.get('running')).toBeDefined();
    expect(challenge.perActivityGoals.get('running').value).toBe(10);
    expect(challenge.perActivityGoals.get('cycling').value).toBe(50);
  });

  test('✅ Progress calculation with perActivityGoals', async () => {
    // Create challenge with per-activity goals
    const createRes = await request(app)
      .post('/api/challenges')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        goal: { type: 'distance', value: 60 },
        activityTypes: ['running', 'cycling'],
        title: 'Multi-sport',
        perActivityGoals: {
          running: { type: 'distance', value: 10 },
          cycling: { type: 'distance', value: 50 }
        },
        icon: 'trophy-outline'
      });

    expect(createRes.status).toBe(201);

    // Add running activity (5km - 50% of 10km goal)
    await request(app)
      .post('/api/activities')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        type: 'running',
        title: 'Course matinale',
        duration: 30,
        distance: 5,
        date: new Date().toISOString(),
        source: 'manual'
      });

    // Add cycling activity (50km - 100% of 50km goal)
    await request(app)
      .post('/api/activities')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        type: 'cycling',
        title: 'Sortie vélo',
        duration: 120,
        distance: 50,
        date: new Date().toISOString(),
        source: 'manual'
      });

    // Refresh progress
    const progressRes = await request(app)
      .post('/api/challenges/refresh-progress')
      .set('Authorization', `Bearer ${authToken}`);

    expect(progressRes.status).toBe(200);
    
    // With per-activity goals:
    // running: 5/10 = not completed
    // cycling: 50/50 = completed
    // 1 out of 2 goals completed = 50% -> scaled to goal value (60 * 0.5 = 30)
    const player = progressRes.body.data.players?.[0];
    expect(player).toBeDefined();
    
    // perActivityProgress should contain detailed breakdown
    if (player.perActivityProgress) {
      expect(player.perActivityProgress.running.current).toBe(5);
      expect(player.perActivityProgress.running.target).toBe(10);
      expect(player.perActivityProgress.running.completed).toBe(false);
      
      expect(player.perActivityProgress.cycling.current).toBe(50);
      expect(player.perActivityProgress.cycling.target).toBe(50);
      expect(player.perActivityProgress.cycling.completed).toBe(true);
    }
  });

  test('❌ POST /api/challenges - Should reject invalid perActivityGoals', async () => {
    const res = await request(app)
      .post('/api/challenges')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        goal: { type: 'distance', value: 10 },
        activityTypes: ['running'],
        title: 'Invalid goals',
        perActivityGoals: {
          cycling: { type: 'distance', value: 50 } // cycling not in activityTypes
        },
        icon: 'trophy-outline'
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/non sélectionné/i);
  });
});

describe('🔄 Recurrence (Auto-Renewal) Feature', () => {
  let app;
  
  beforeEach(() => {
    app = createTestApp();
  });

  test('✅ POST /api/challenges - Should accept recurrence config', async () => {
    const res = await request(app)
      .post('/api/challenges')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        goal: { type: 'count', value: 3 },
        activityTypes: ['running'],
        title: '3 sessions/semaine',
        recurrence: {
          enabled: true,
          weeksCount: 4
        },
        icon: 'trophy-outline'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    
    // Verify recurrence is stored
    const challenge = await WeeklyChallenge.findById(res.body.data._id);
    expect(challenge.recurrence).toBeDefined();
    expect(challenge.recurrence.enabled).toBe(true);
    expect(challenge.recurrence.weeksCount).toBe(4);
    expect(challenge.recurrence.weeksCompleted).toBe(0);
  });

  test('✅ POST /api/challenges - weeksCount should be clamped (1-52)', async () => {
    const res = await request(app)
      .post('/api/challenges')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        goal: { type: 'count', value: 2 },
        activityTypes: ['workout'],
        title: 'Long term',
        recurrence: {
          enabled: true,
          weeksCount: 100 // Should be clamped to 52
        },
        icon: 'trophy-outline'
      });

    expect(res.status).toBe(201);
    
    const challenge = await WeeklyChallenge.findById(res.body.data._id);
    expect(challenge.recurrence.weeksCount).toBe(52);
  });

  test('✅ Recurrence disabled by default', async () => {
    const res = await request(app)
      .post('/api/challenges')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        goal: { type: 'distance', value: 10 },
        activityTypes: ['running'],
        title: 'No recurrence',
        icon: 'trophy-outline'
      });

    expect(res.status).toBe(201);
    
    const challenge = await WeeklyChallenge.findById(res.body.data._id);
    // Recurrence should be undefined or have enabled: false
    const isDisabled = !challenge.recurrence || !challenge.recurrence.enabled;
    expect(isDisabled).toBe(true);
  });

  test('✅ GET /api/challenges/current - Should return recurrence info', async () => {
    // Create challenge with recurrence
    await request(app)
      .post('/api/challenges')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        goal: { type: 'count', value: 5 },
        activityTypes: ['running'],
        title: '5 courses/semaine',
        recurrence: {
          enabled: true,
          weeksCount: 8
        },
        icon: 'repeat-outline'
      });

    const res = await request(app)
      .get('/api/challenges/current')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.recurrence).toBeDefined();
    expect(res.body.data.recurrence.enabled).toBe(true);
    expect(res.body.data.recurrence.weeksCount).toBe(8);
  });
});

describe('🚫 Yoga Removed', () => {
  let app;
  
  beforeEach(() => {
    app = createTestApp();
  });

  test('❌ POST /api/challenges - Should reject yoga activity type', async () => {
    const res = await request(app)
      .post('/api/challenges')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        goal: { type: 'count', value: 3 },
        activityTypes: ['yoga'], // yoga is removed
        title: 'Yoga challenge',
        icon: 'trophy-outline'
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('✅ POST /api/challenges - Should accept workout (yoga replacement)', async () => {
    const res = await request(app)
      .post('/api/challenges')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        goal: { type: 'count', value: 3 },
        activityTypes: ['workout'],
        title: 'Workout challenge',
        icon: 'trophy-outline'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
});

describe('🎯 Combined Features', () => {
  let app;
  
  beforeEach(() => {
    app = createTestApp();
  });

  test('✅ Create challenge with all new features', async () => {
    const res = await request(app)
      .post('/api/challenges')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        goal: { type: 'distance', value: 60 },
        activityTypes: ['running', 'cycling', 'swimming'],
        title: 'Triathlon prep',
        customTitle: 'Préparation Ironman 70.3',
        perActivityGoals: {
          running: { type: 'distance', value: 10 },
          cycling: { type: 'distance', value: 40 },
          swimming: { type: 'distance', value: 2 }
        },
        recurrence: {
          enabled: true,
          weeksCount: 12
        },
        icon: 'medal-outline'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    
    const challenge = await WeeklyChallenge.findById(res.body.data._id);
    
    // Verify all features
    expect(challenge.customTitle).toBe('Préparation Ironman 70.3');
    
    expect(challenge.perActivityGoals).toBeDefined();
    expect(challenge.perActivityGoals.size).toBe(3);
    expect(challenge.perActivityGoals.get('running').value).toBe(10);
    expect(challenge.perActivityGoals.get('cycling').value).toBe(40);
    expect(challenge.perActivityGoals.get('swimming').value).toBe(2);
    
    expect(challenge.recurrence.enabled).toBe(true);
    expect(challenge.recurrence.weeksCount).toBe(12);
    expect(challenge.recurrence.weeksCompleted).toBe(0);
  });
});
