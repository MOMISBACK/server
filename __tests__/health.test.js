const request = require('supertest');
const express = require('express');
const userRoutes = require('../routes/userRoutes');
const User = require('../models/User');
const { createTestUserWithToken } = require('./helpers/authHelper');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/users', userRoutes);
  return app;
}

describe('🏥 Health Integration API', () => {
  let app;
  let user;
  let token;

  beforeEach(async () => {
    app = createTestApp();
    const testData = await createTestUserWithToken();
    user = testData.user;
    token = testData.token;
  });

  describe('GET /api/users/health', () => {
    test('✅ Devrait retourner le statut health par défaut', async () => {
      const res = await request(app)
        .get('/api/users/health')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.health).toBeDefined();
      // Le modèle User retourne des valeurs par défaut
      expect(res.body.data.health.appleHealth).toBeDefined();
      expect(res.body.data.health.healthConnect).toBeDefined();
      expect(res.body.data.health.appleHealth.linked).toBe(false);
      expect(res.body.data.health.healthConnect.linked).toBe(false);
    });

    test('✅ Devrait retourner le statut health si déjà configuré', async () => {
      // Configurer d'abord un statut health
      await User.findByIdAndUpdate(user._id, {
        $set: {
          'health.appleHealth.linked': true,
          'health.appleHealth.autoImport': true,
          'health.appleHealth.permissions': ['Workout'],
          'health.appleHealth.lastSyncAt': new Date('2025-12-25T10:00:00Z'),
        },
      });

      const res = await request(app)
        .get('/api/users/health')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.health.appleHealth).toBeDefined();
      expect(res.body.data.health.appleHealth.linked).toBe(true);
      expect(res.body.data.health.appleHealth.autoImport).toBe(true);
      expect(res.body.data.health.appleHealth.permissions).toEqual(['Workout']);
    });

    test('❌ Devrait échouer sans token', async () => {
      const res = await request(app).get('/api/users/health');

      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/users/health', () => {
    test('✅ Devrait lier Apple Health', async () => {
      const res = await request(app)
        .put('/api/users/health')
        .set('Authorization', `Bearer ${token}`)
        .send({
          provider: 'appleHealth',
          linked: true,
          autoImport: true,
          permissions: ['Workout', 'HeartRate'],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.health.appleHealth.linked).toBe(true);
      expect(res.body.data.health.appleHealth.autoImport).toBe(true);
      expect(res.body.data.health.appleHealth.permissions).toEqual([
        'Workout',
        'HeartRate',
      ]);
    });

    test('✅ Devrait lier Health Connect', async () => {
      const res = await request(app)
        .put('/api/users/health')
        .set('Authorization', `Bearer ${token}`)
        .send({
          provider: 'healthConnect',
          linked: true,
          autoImport: false,
          permissions: ['ExerciseSession'],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.health.healthConnect.linked).toBe(true);
      expect(res.body.data.health.healthConnect.autoImport).toBe(false);
      expect(res.body.data.health.healthConnect.permissions).toEqual([
        'ExerciseSession',
      ]);
    });

    test('✅ Devrait mettre à jour lastSyncAt', async () => {
      const syncDate = new Date('2025-12-26T12:00:00Z');

      const res = await request(app)
        .put('/api/users/health')
        .set('Authorization', `Bearer ${token}`)
        .send({
          provider: 'appleHealth',
          lastSyncAt: syncDate.toISOString(),
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.health.appleHealth.lastSyncAt).toBeDefined();

      // Vérifier que la date a bien été stockée
      const parsedDate = new Date(res.body.data.health.appleHealth.lastSyncAt);
      expect(parsedDate.getTime()).toBe(syncDate.getTime());
    });

    test('✅ Devrait délier un provider', async () => {
      // Lier d'abord
      await request(app)
        .put('/api/users/health')
        .set('Authorization', `Bearer ${token}`)
        .send({
          provider: 'appleHealth',
          linked: true,
        });

      // Délier ensuite
      const res = await request(app)
        .put('/api/users/health')
        .set('Authorization', `Bearer ${token}`)
        .send({
          provider: 'appleHealth',
          linked: false,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.health.appleHealth.linked).toBe(false);
    });

    test('✅ Devrait gérer plusieurs providers indépendamment', async () => {
      // Lier Apple Health
      await request(app)
        .put('/api/users/health')
        .set('Authorization', `Bearer ${token}`)
        .send({
          provider: 'appleHealth',
          linked: true,
          autoImport: true,
        });

      // Lier Health Connect
      await request(app)
        .put('/api/users/health')
        .set('Authorization', `Bearer ${token}`)
        .send({
          provider: 'healthConnect',
          linked: true,
          autoImport: false,
        });

      // Vérifier les deux
      const res = await request(app)
        .get('/api/users/health')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.health.appleHealth.linked).toBe(true);
      expect(res.body.data.health.appleHealth.autoImport).toBe(true);
      expect(res.body.data.health.healthConnect.linked).toBe(true);
      expect(res.body.data.health.healthConnect.autoImport).toBe(false);
    });

    test('❌ Devrait rejeter un provider invalide', async () => {
      const res = await request(app)
        .put('/api/users/health')
        .set('Authorization', `Bearer ${token}`)
        .send({
          provider: 'googleFit',
          linked: true,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('invalide');
    });

    test('❌ Devrait rejeter sans provider', async () => {
      const res = await request(app)
        .put('/api/users/health')
        .set('Authorization', `Bearer ${token}`)
        .send({
          linked: true,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('❌ Devrait rejeter sans données à mettre à jour', async () => {
      const res = await request(app)
        .put('/api/users/health')
        .set('Authorization', `Bearer ${token}`)
        .send({
          provider: 'appleHealth',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Aucune donnée');
    });

    test('❌ Devrait échouer sans token', async () => {
      const res = await request(app).put('/api/users/health').send({
        provider: 'appleHealth',
        linked: true,
      });

      expect(res.status).toBe(401);
    });

    test('✅ Devrait ignorer lastSyncAt invalide', async () => {
      const res = await request(app)
        .put('/api/users/health')
        .set('Authorization', `Bearer ${token}`)
        .send({
          provider: 'appleHealth',
          linked: true,
          lastSyncAt: 'invalid-date',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.health.appleHealth.linked).toBe(true);
      expect(res.body.data.health.appleHealth.lastSyncAt).toBeUndefined();
    });

    test('✅ Devrait convertir permissions en strings', async () => {
      const res = await request(app)
        .put('/api/users/health')
        .set('Authorization', `Bearer ${token}`)
        .send({
          provider: 'appleHealth',
          linked: true,
          permissions: [123, 'Workout', true, null],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.health.appleHealth.permissions).toEqual([
        '123',
        'Workout',
        'true',
        'null',
      ]);
    });
  });
});
