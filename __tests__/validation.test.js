// server/__tests__/validation.test.js

const request = require('supertest');
const express = require('express');
const activityRoutes = require('../routes/activityRoutes');
const challengeRoutes = require('../routes/challengeRoutes');
const { createTestUserWithToken } = require('./helpers/authHelper');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/activities', activityRoutes);
  app.use('/api/challenges', challengeRoutes);
  return app;
}

describe('🛡️ Validation Backend', () => {
  let app;
  let user;
  let token;

  beforeEach(async () => {
    app = createTestApp();
    const testData = await createTestUserWithToken();
    user = testData.user;
    token = testData.token;
  });

  describe('Activities - Validation des champs selon le type', () => {
    test('❌ Devrait rejeter distance pour yoga', async () => {
      const res = await request(app)
        .post('/api/activities')
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'yoga',
          title: 'Yoga session',
          duration: 45,
          distance: 10,
          date: new Date().toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.invalidFields).toContain('distance');
    });

    test('❌ Devrait rejeter poolLength pour running', async () => {
      const res = await request(app)
        .post('/api/activities')
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'running',
          title: 'Course',
          duration: 60,
          distance: 10,
          poolLength: 25,
          date: new Date().toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.invalidFields).toContain('poolLength');
    });

    test('❌ Devrait rejeter exercises pour cycling', async () => {
      const res = await request(app)
        .post('/api/activities')
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'cycling',
          title: 'Vélo',
          duration: 90,
          distance: 30,
          exercises: [{ name: 'Squat' }],
          date: new Date().toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.invalidFields).toContain('exercises');
    });

    test('✅ Devrait accepter tous les champs valides pour running', async () => {
      const res = await request(app)
        .post('/api/activities')
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'running',
          title: 'Course matinale',
          duration: 60,
          distance: 10,
          elevationGain: 150,
          avgSpeed: 10,
          date: new Date().toISOString(),
        });

      expect(res.status).toBe(201);
    });
  });

  describe('Activities - Validation des ranges', () => {
    test('❌ Devrait rejeter distance négative', async () => {
      const res = await request(app)
        .post('/api/activities')
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'running',
          title: 'Course',
          duration: 60,
          distance: -5,
          date: new Date().toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });

    test('❌ Devrait rejeter duration > 1440 minutes', async () => {
      const res = await request(app)
        .post('/api/activities')
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'running',
          title: 'Course',
          duration: 2000,
          distance: 10,
          date: new Date().toISOString(),
        });

      expect(res.status).toBe(400);
    });

    test('❌ Devrait rejeter title trop court', async () => {
      const res = await request(app)
        .post('/api/activities')
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'running',
          title: 'ab',
          duration: 60,
          distance: 10,
          date: new Date().toISOString(),
        });

      expect(res.status).toBe(400);
    });
  });

  describe('Challenges - Validation', () => {
    test('❌ Devrait rejeter activityTypes vide', async () => {
      const res = await request(app)
        .post('/api/challenges')
        .set('Authorization', `Bearer ${token}`)
        .send({
          activityTypes: [],
          goals: [{ type: 'distance', value: 50 }],  // ⭐ Nouveau format
          title: 'Défi test de validation',
        });

      expect(res.status).toBe(400);
    });

    test('❌ Devrait rejeter goals vide', async () => {
      const res = await request(app)
        .post('/api/challenges')
        .set('Authorization', `Bearer ${token}`)
        .send({
          activityTypes: ['running'],
          goals: [],  // ⭐ Vide
          title: 'Défi test de validation',
        });

      expect(res.status).toBe(400);
    });

    test('❌ Devrait rejeter goalType invalide', async () => {
      const res = await request(app)
        .post('/api/challenges')
        .set('Authorization', `Bearer ${token}`)
        .send({
          activityTypes: ['running'],
          goals: [{ type: 'speed', value: 50 }],  // ⭐ Type invalide
          title: 'Défi test de validation',
        });

      expect(res.status).toBe(400);
    });

    test('❌ Devrait rejeter goalValue < 0.1', async () => {
      const res = await request(app)
        .post('/api/challenges')
        .set('Authorization', `Bearer ${token}`)
        .send({
          activityTypes: ['running'],
          goals: [{ type: 'distance', value: 0 }],  // ⭐ Trop petit
          title: 'Défi test de validation',
        });

      expect(res.status).toBe(400);
    });

    test('✅ Devrait accepter title court (ancien test obsolète)', async () => {
      const res = await request(app)
        .post('/api/challenges')
        .set('Authorization', `Bearer ${token}`)
        .send({
          activityTypes: ['running'],
          goals: [{ type: 'distance', value: 50 }],
          title: 'Test',  // Accepté maintenant
        });

      expect(res.status).toBe(201);
    });
  });
});