const request = require('supertest');
const express = require('express');
const challengeRoutes = require('../routes/challenges');
const Activity = require('../models/Activity');
const { createTestUserWithToken } = require('./helpers/authHelper');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/challenges', challengeRoutes);
  return app;
}

describe('🏆 Challenges API', () => {
  let app;
  let user;
  let token;

  beforeEach(async () => {
    app = createTestApp();
    const testData = await createTestUserWithToken();
    user = testData.user;
    token = testData.token;
  });

  describe('POST /api/challenges', () => {
    const validChallengeData = {
      activityTypes: ['running', 'cycling'],
      goalType: 'distance',
      goalValue: 50,
      title: 'Défi 50km',
      icon: 'trophy-outline',
    };

    test('✅ Devrait créer un nouveau défi', async () => {
      const res = await request(app)
        .post('/api/challenges')
        .set('Authorization', `Bearer ${token}`)
        .send(validChallengeData);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('_id');
      expect(res.body.title).toBe('Défi 50km');
      expect(res.body.goalValue).toBe(50);
      expect(res.body.activityTypes).toEqual(['running', 'cycling']);
    });

    test('❌ Devrait rejeter sans authentification', async () => {
      const res = await request(app)
        .post('/api/challenges')
        .send(validChallengeData);

      expect(res.status).toBe(401);
    });

    test('❌ Devrait rejeter si un défi existe déjà cette semaine', async () => {
      await request(app)
        .post('/api/challenges')
        .set('Authorization', `Bearer ${token}`)
        .send(validChallengeData);

      const res = await request(app)
        .post('/api/challenges')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...validChallengeData, title: 'Autre défi' });

      expect(res.status).toBe(409);
    });
  });

  describe('GET /api/challenges/current', () => {
    test('✅ Devrait retourner le défi actif avec progression', async () => {
      await request(app)
        .post('/api/challenges')
        .set('Authorization', `Bearer ${token}`)
        .send({
          activityTypes: ['running'],
          goalType: 'distance',
          goalValue: 20,
          title: 'Défi 20km',
        });

      // ⚠️ Ajouter le champ title
      await Activity.create({
        user: user._id,
        type: 'running',
        title: 'Course du matin', // ✅ Ajouté
        distance: 10,
        duration: 60,
        date: new Date(),
        source: 'manual',
      });

      const res = await request(app)
        .get('/api/challenges/current')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Défi 20km');
      expect(res.body.progress).toBeDefined();
      expect(res.body.progress.current).toBe(10);
      expect(res.body.progress.goal).toBe(20);
      expect(res.body.progress.percentage).toBe(50);
    });

    test('✅ Devrait retourner null si aucun défi', async () => {
      const res = await request(app)
        .get('/api/challenges/current')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toBeNull();
    });
  });

  describe('DELETE /api/challenges', () => {
    test('✅ Devrait supprimer le défi actif', async () => {
      await request(app)
        .post('/api/challenges')
        .set('Authorization', `Bearer ${token}`)
        .send({
          activityTypes: ['running'],
          goalType: 'distance',
          goalValue: 20,
          title: 'Défi à supprimer',
        });

      const res = await request(app)
        .delete('/api/challenges')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(204);
    });
  });
});
