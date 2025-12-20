// server/__tests__/challenges.test.js

const request = require('supertest');
const app = require('../app');
const mongoose = require('mongoose');
const User = require('../models/User');
const WeeklyChallenge = require('../models/WeeklyChallenge');
const Activity = require('../models/Activity');

let authToken;
let userId;

beforeAll(async () => {
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  await User.deleteMany({});
  await WeeklyChallenge.deleteMany({});
  await Activity.deleteMany({});

  const userRes = await request(app)
    .post('/api/auth/register')
    .send({
      email: 'test-challenges@test.com',
      password: 'Test123!'
    });

  console.log('🔍 Register response:', userRes.status, userRes.body);

  if (userRes.status !== 201 || !userRes.body.token) {
    throw new Error(`Échec register: ${JSON.stringify(userRes.body)}`);
  }

  authToken = userRes.body.token;
  userId = userRes.body._id;  // ⭐ Directement _id (pas user._id)
  
  console.log('✅ User créé:', userId);
}, 10000);

afterAll(async () => {
  try {
    await User.deleteMany({});
    await WeeklyChallenge.deleteMany({});
    await Activity.deleteMany({});
  } catch (error) {
    console.log('⚠️ Erreur nettoyage:', error.message);
  } finally {
    await mongoose.connection.close();
  }
}, 10000);

describe('🎯 Challenges API - Multi-objectifs', () => {
  
  test('POST /api/challenges - Créer avec 1 objectif', async () => {
    await WeeklyChallenge.deleteMany({ user: userId });
    const res = await request(app)
      .post('/api/challenges')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        goals: [
          { type: 'distance', value: 10 }
        ],
        activityTypes: ['running'],
        title: '10 km de course',
        icon: 'trophy-outline'
      });
  
    console.log('📥 Response status:', res.status);
    console.log('📥 Response body:', res.body);  // ⭐ Voir l'erreur
  
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.goals).toHaveLength(1);
    expect(res.body.data.goals[0].type).toBe('distance');
    expect(res.body.data.goals[0].value).toBe(10);
    expect(res.body.data.overallProgress.totalGoals).toBe(1);
  });
  

  test('POST /api/challenges - Créer avec multi-objectifs', async () => {
    

    const res = await request(app)
      .post('/api/challenges')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        goals: [
          { type: 'distance', value: 15 },
          { type: 'duration', value: 300 },
          { type: 'count', value: 3 }
        ],
        activityTypes: ['running', 'cycling'],
        title: '15 km + 5h + 3 activités',
        icon: 'flag-outline'
      });

    expect(res.status).toBe(201);
    expect(res.body.data.goals).toHaveLength(3);
    expect(res.body.data.progress).toHaveLength(3);
    expect(res.body.data.overallProgress.totalGoals).toBe(3);
    expect(res.body.data.overallProgress.percentage).toBe(0);
  });

  test('GET /api/challenges/current - Récupérer le challenge actif', async () => {
    const res = await request(app)
      .get('/api/challenges/current')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.goals).toBeDefined();
    expect(Array.isArray(res.body.data.goals)).toBe(true);
  });

  test('POST /refresh-progress - Calculer progression multi-objectifs', async () => {
    // Créer 2 activités
    await request(app)
      .post('/api/activities')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        type: 'running',
        title: 'Course 1',
        duration: 60,
        distance: 8,
        date: new Date().toISOString(),
        source: 'manual'
      });

    await request(app)
      .post('/api/activities')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        type: 'cycling',
        title: 'Vélo 1',
        duration: 120,
        distance: 20,
        date: new Date().toISOString(),
        source: 'manual'
      });

    // Rafraîchir la progression
    const res = await request(app)
      .post('/api/challenges/refresh-progress')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.progress).toHaveLength(3);
    
    // Vérifier distance (8 + 20 = 28 km)
    const distanceProgress = res.body.data.progress.find(p => p.goalType === 'distance');
    expect(distanceProgress).toBeDefined();
    expect(distanceProgress.current).toBe(28);
    
    // Vérifier durée (60 + 120 = 180 min)
    const durationProgress = res.body.data.progress.find(p => p.goalType === 'duration');
    expect(durationProgress).toBeDefined();
    expect(durationProgress.current).toBe(180);
    
    // Vérifier count (2 activités)
    const countProgress = res.body.data.progress.find(p => p.goalType === 'count');
    expect(countProgress).toBeDefined();
    expect(countProgress.current).toBe(2);

    // Progression globale (distance + durée complétés)
    expect(res.body.data.overallProgress.completedGoals).toBe(2);
  });

  test('PUT /api/challenges/current - Modifier le challenge', async () => {
    const res = await request(app)
      .put('/api/challenges/current')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        goals: [
          { type: 'distance', value: 50 },
          { type: 'count', value: 5 }
        ],
        activityTypes: ['running', 'walking'],
        title: '50 km + 5 activités',
        icon: 'rocket-outline'
      });

    expect(res.status).toBe(200);
    expect(res.body.data.goals).toHaveLength(2);
    expect(res.body.data.goals[0].value).toBe(50);
    expect(res.body.data.overallProgress.totalGoals).toBe(2);
  });

  test('DELETE /api/challenges/current - Supprimer le challenge', async () => {
    const res = await request(app)
      .delete('/api/challenges/current')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Vérifier suppression
    const getRes = await request(app)
      .get('/api/challenges/current')
      .set('Authorization', `Bearer ${authToken}`);

    expect(getRes.status).toBe(404);
  });

  test('❌ POST /api/challenges - Rejeter sans objectifs', async () => {
    const res = await request(app)
      .post('/api/challenges')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        goals: [],
        activityTypes: ['running'],
        title: 'Test',
        icon: 'trophy-outline'
      });

    expect(res.status).toBe(400);
  });

  test('❌ POST /api/challenges - Rejeter sans types d\'activités', async () => {
    const res = await request(app)
      .post('/api/challenges')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        goals: [{ type: 'distance', value: 10 }],
        activityTypes: [],
        title: 'Test',
        icon: 'trophy-outline'
      });

    expect(res.status).toBe(400);
  });

  test('❌ POST /api/challenges - Rejeter sans authentification', async () => {
    const res = await request(app)
      .post('/api/challenges')
      .send({
        goals: [{ type: 'distance', value: 10 }],
        activityTypes: ['running'],
        title: 'Test',
        icon: 'trophy-outline'
      });

    expect(res.status).toBe(401);
  });
});