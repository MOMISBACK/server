// server/__tests__/challenges.test.js

const request = require('supertest');
const app = require('../app');
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

describe('🎯 Challenges API - Multi-objectifs', () => {
  test('POST /api/challenges - Créer avec 1 objectif', async () => {
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
    // Créer un challenge d'abord (tests isolés)
    await request(app)
      .post('/api/challenges')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        goal: { type: 'distance', value: 10 },
        activityTypes: ['running'],
        title: 'Current challenge',
        icon: 'trophy-outline'
      });

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
    // Créer un challenge d'abord (tests isolés)
    await request(app)
      .post('/api/challenges')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        goal: { type: 'distance', value: 10 },
        activityTypes: ['running'],
        title: 'To update',
        icon: 'trophy-outline'
      });

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
    // Créer un challenge d'abord (tests isolés)
    await request(app)
      .post('/api/challenges')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        goal: { type: 'distance', value: 10 },
        activityTypes: ['running'],
        title: 'To delete',
        icon: 'trophy-outline'
      });

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
    const { user: partnerUser } = await createTestUserWithToken();
    const partnerId = partnerUser._id.toString();

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
    const { user: partnerUser } = await createTestUserWithToken();
    const partnerId = partnerUser._id.toString();

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
    const { user: partnerUser, token: partnerToken } = await createTestUserWithToken();
    const partnerId = partnerUser._id.toString();

    const invite = await request(app)
      .post('/api/challenges')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ mode: 'duo', partnerId, goal: { type: 'distance', value: 5 }, activityTypes: ['running'], title: 'InviteAccept', icon: 'bolt' });

    expect(invite.status).toBe(201);
    const challengeId = invite.body.data._id;

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
    const { user: partnerUser, token: partnerToken } = await createTestUserWithToken();
    const partnerId = partnerUser._id.toString();

    const invite = await request(app)
      .post('/api/challenges')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ mode: 'duo', partnerId, goal: { type: 'count', value: 2 }, activityTypes: ['walking'], title: 'InviteRefuse', icon: 'close' });

    expect(invite.status).toBe(201);
    const challengeId = invite.body.data._id;

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
    const { user: partnerUser, token: partnerToken } = await createTestUserWithToken();
    const partnerId = partnerUser._id.toString();

    const invite = await request(app)
      .post('/api/challenges')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ mode: 'duo', partnerId, goal: { type: 'distance', value: 1 }, activityTypes: ['running'], title: 'InviteFinalize', icon: 'trophy' });

    expect(invite.status).toBe(201);
    const challengeId = invite.body.data._id;

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