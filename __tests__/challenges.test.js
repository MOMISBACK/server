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
        goal: { type: 'distance', value: 10 },
        activityTypes: ['running'],
        title: '10 km de course',
        icon: 'trophy-outline'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.goal).toBeDefined();
    expect(res.body.data.goal.type).toBe('distance');
    expect(res.body.data.goal.value).toBe(10);
    expect(res.body.data.progress.goal).toBe(10);
  });

  test('POST /api/challenges - Rejeter multi-objectifs (non supporté)', async () => {
    const res = await request(app)
      .post('/api/challenges')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        goals: [
          { type: 'distance', value: 15 },
          { type: 'duration', value: 300 },
        ],
        activityTypes: ['running', 'cycling'],
        title: '15 km + 5h',
        icon: 'flag-outline'
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('GET /api/challenges/current - Récupérer le challenge actif', async () => {
    const res = await request(app)
      .get('/api/challenges/current')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.goal).toBeDefined();
    expect(typeof res.body.data.goal).toBe('object');
  });

  test('POST /refresh-progress - Calculer progression distance pour un challenge distance', async () => {
    // Créer un challenge distance couvrant running + cycling
    await WeeklyChallenge.deleteMany({ user: userId });
    const createRes = await request(app)
      .post('/api/challenges')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        goal: { type: 'distance', value: 100 },
        activityTypes: ['running', 'cycling'],
        title: 'Distance multi',
        icon: 'flag-outline'
      });

    expect(createRes.status).toBe(201);

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
    expect(res.body.success).toBe(true);

    // Vérifier distance (8 + 20 = 28 km)
    expect(res.body.data.progress.current).toBe(28);
    expect(res.body.data.progress.goal).toBe(100);
  });

  test('PUT /api/challenges/current - Modifier le challenge', async () => {
    const res = await request(app)
      .put('/api/challenges/current')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        goal: { type: 'distance', value: 50 },
        activityTypes: ['running', 'walking'],
        title: '50 km',
        icon: 'rocket-outline'
      });

    expect(res.status).toBe(200);
    expect(res.body.data.goal.value).toBe(50);
    expect(res.body.data.progress.goal).toBe(50);
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

describe('🎯 Duo / Invitations flows', () => {
  test('POST /api/challenges (duo) - Créer une invitation DUO', async () => {
    // Créer le partenaire
    const partnerRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'partner1@test.com', password: 'Partner123!' });

    expect(partnerRes.status).toBe(201);
    const partnerId = partnerRes.body._id;

    // Créer l'invitation en mode duo
    const createRes = await request(app)
      .post('/api/challenges')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        mode: 'duo',
        partnerId,
        goal: { type: 'distance', value: 10 },
        activityTypes: ['running'],
        title: 'Duo Invite',
        icon: 'heart'
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    expect(createRes.body.data.mode).toBe('duo');
    expect(createRes.body.data.status).toBe('pending');
    expect(createRes.body.data.invitationStatus).toBe('pending');
  });

  test('POST /api/challenges (duo) - Empêcher invitations pendantes dupliquées', async () => {
    // Créer un second partenaire
    const p = await request(app)
      .post('/api/auth/register')
      .send({ email: 'partner2@test.com', password: 'Partner123!' });

    expect(p.status).toBe(201);
    const partnerId = p.body._id;

    // Première invitation
    const first = await request(app)
      .post('/api/challenges')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ mode: 'duo', partnerId, goal: { type: 'count', value: 3 }, activityTypes: ['running'], title: 'First', icon: 'star' });

    expect(first.status).toBe(201);

    // Deuxième invitation identique -> doit échouer
    const second = await request(app)
      .post('/api/challenges')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ mode: 'duo', partnerId, goal: { type: 'count', value: 3 }, activityTypes: ['running'], title: 'Dup', icon: 'star' });

    expect(second.status).toBe(400);
    expect(second.body.success).toBe(false);
    expect(second.body.message).toMatch(/déjà une invitation en attente|invitation en attente/i);
  });

  test('POST /api/challenges/:id/accept - Accepter une invitation', async () => {
    // Créer partenaire et invitation
    const partner = await request(app)
      .post('/api/auth/register')
      .send({ email: 'partner3@test.com', password: 'Partner123!' });

    expect(partner.status).toBe(201);
    const partnerId = partner.body._id;

    const invite = await request(app)
      .post('/api/challenges')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ mode: 'duo', partnerId, goal: { type: 'distance', value: 5 }, activityTypes: ['running'], title: 'InviteAccept', icon: 'bolt' });

    expect(invite.status).toBe(201);
    const challengeId = invite.body.data._id;

    // Login partner to get token
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'partner3@test.com', password: 'Partner123!' });

    expect(login.status).toBe(200);
    const partnerToken = login.body.token;

    const res = await request(app)
      .post(`/api/challenges/${challengeId}/accept`)
      .set('Authorization', `Bearer ${partnerToken}`)
      .send();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('active');
    expect(res.body.data.invitationStatus).toBe('accepted');
  });

  test('POST /api/challenges/:id/refuse - Refuser une invitation', async () => {
    // Créer partenaire et invitation
    const partner = await request(app)
      .post('/api/auth/register')
      .send({ email: 'partner4@test.com', password: 'Partner123!' });

    expect(partner.status).toBe(201);
    const partnerId = partner.body._id;

    const invite = await request(app)
      .post('/api/challenges')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ mode: 'duo', partnerId, goal: { type: 'count', value: 2 }, activityTypes: ['walking'], title: 'InviteRefuse', icon: 'close' });

    expect(invite.status).toBe(201);
    const challengeId = invite.body.data._id;

    // Login partner
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'partner4@test.com', password: 'Partner123!' });

    expect(login.status).toBe(200);
    const partnerToken = login.body.token;

    const res = await request(app)
      .post(`/api/challenges/${challengeId}/refuse`)
      .set('Authorization', `Bearer ${partnerToken}`)
      .send();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('cancelled');
    expect(res.body.data.invitationStatus).toBe('refused');
  });

  test('POST /api/challenges/:id/finalize - Finaliser et attribuer diamants pour DUO', async () => {
    // Créer partenaire et invitation
    const partner = await request(app)
      .post('/api/auth/register')
      .send({ email: 'partner5@test.com', password: 'Partner123!' });

    expect(partner.status).toBe(201);
    const partnerId = partner.body._id;

    const invite = await request(app)
      .post('/api/challenges')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ mode: 'duo', partnerId, goal: { type: 'distance', value: 1 }, activityTypes: ['running'], title: 'InviteFinalize', icon: 'trophy' });

    expect(invite.status).toBe(201);
    const challengeId = invite.body.data._id;

    // Login partner and accept
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'partner5@test.com', password: 'Partner123!' });

    expect(login.status).toBe(200);
    const partnerToken = login.body.token;

    const acceptRes = await request(app)
      .post(`/api/challenges/${challengeId}/accept`)
      .set('Authorization', `Bearer ${partnerToken}`)
      .send();

    expect(acceptRes.status).toBe(200);

    // Créer une activité pour chaque joueur pour atteindre l'objectif
    await request(app)
      .post('/api/activities')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ type: 'running', title: 'Run A', duration: 10, distance: 1.2, date: new Date().toISOString(), source: 'manual' });

    await request(app)
      .post('/api/activities')
      .set('Authorization', `Bearer ${partnerToken}`)
      .send({ type: 'running', title: 'Run B', duration: 10, distance: 1.2, date: new Date().toISOString(), source: 'manual' });

    // Rafraîchir progression pour calculer diamants
    const refresh = await request(app)
      .post('/api/challenges/refresh-progress')
      .set('Authorization', `Bearer ${authToken}`)
      .send();

    expect(refresh.status).toBe(200);

    // Finaliser le challenge (appelé par le créateur)
    const finalize = await request(app)
      .post(`/api/challenges/${challengeId}/finalize`)
      .set('Authorization', `Bearer ${authToken}`)
      .send();

    expect(finalize.status).toBe(200);
    expect(finalize.body.success).toBe(true);

    // Vérifier que les deux utilisateurs ont reçu des diamants
    const u1 = await User.findById(userId);
    const u2 = await User.findById(partnerId);

    expect(u1.totalDiamonds).toBeGreaterThanOrEqual(0);
    expect(u2.totalDiamonds).toBeGreaterThanOrEqual(0);
  });
});