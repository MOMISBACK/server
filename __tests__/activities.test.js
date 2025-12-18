const request = require('supertest');
const express = require('express');
const activityRoutes = require('../routes/activityRoutes');
const Activity = require('../models/Activity');
const { createTestUserWithToken } = require('./helpers/authHelper');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/activities', activityRoutes);
  return app;
}

describe('🏃 Activities API', () => {
  let app;
  let user;
  let token;

  beforeEach(async () => {
    app = createTestApp();
    const testData = await createTestUserWithToken();
    user = testData.user;
    token = testData.token;
  });

  describe('POST /api/activities', () => {
    const validRunningActivity = {
      type: 'running',
      title: 'Course du matin',
      distance: 10,
      duration: 60,
      elevationGain: 150,
      date: new Date().toISOString(),
    };

    test('✅ Devrait créer une activité running', async () => {
      const res = await request(app)
        .post('/api/activities')
        .set('Authorization', `Bearer ${token}`)
        .send(validRunningActivity);

      expect(res.status).toBe(201);
      expect(res.body.type).toBe('running');
      expect(res.body.distance).toBe(10);
      expect(res.body.title).toBe('Course du matin');
      expect(res.body.elevationGain).toBe(150);
    });

    test('✅ Devrait stocker avgSpeed si fourni', async () => {
      const activityWithSpeed = {
        ...validRunningActivity,
        avgSpeed: 10
      };

      const res = await request(app)
        .post('/api/activities')
        .set('Authorization', `Bearer ${token}`)
        .send(activityWithSpeed);

      expect(res.status).toBe(201);
      expect(res.body.avgSpeed).toBe(10);
    });

    test('❌ Devrait rejeter sans authentification', async () => {
      const res = await request(app)
        .post('/api/activities')
        .send(validRunningActivity);

      expect(res.status).toBe(401);
    });

    test('❌ Devrait rejeter sans champ type', async () => {
      const invalidData = { ...validRunningActivity };
      delete invalidData.type;

      const res = await request(app)
        .post('/api/activities')
        .set('Authorization', `Bearer ${token}`)
        .send(invalidData);

      expect(res.status).toBe(400);
    });

    test('❌ Devrait rejeter sans champ title', async () => {
      const invalidData = { ...validRunningActivity };
      delete invalidData.title;

      const res = await request(app)
        .post('/api/activities')
        .set('Authorization', `Bearer ${token}`)
        .send(invalidData);

      expect(res.status).toBe(400);
    });

    test('✅ Devrait accepter une activité yoga sans distance', async () => {
      const res = await request(app)
        .post('/api/activities')
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'yoga',
          title: 'Séance yoga',
          duration: 45,
          date: new Date().toISOString(),
        });

      expect(res.status).toBe(201);
      expect(res.body.type).toBe('yoga');
      expect(res.body.duration).toBe(45);
    });

    test('✅ Devrait accepter une activité swimming avec poolLength', async () => {
      const res = await request(app)
        .post('/api/activities')
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'swimming',
          title: 'Natation',
          duration: 30,
          distance: 1.5,
          poolLength: 25,
          laps: 60,
          date: new Date().toISOString(),
        });

      expect(res.status).toBe(201);
      expect(res.body.type).toBe('swimming');
      expect(res.body.poolLength).toBe(25);
      expect(res.body.laps).toBe(60);
    });

    test('✅ Devrait accepter une activité workout avec exercices', async () => {
      const res = await request(app)
        .post('/api/activities')
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'workout',
          title: 'Musculation',
          duration: 60,
          date: new Date().toISOString(),
          exercises: [
            { name: 'Squat', sets: 4, reps: 10, weight: 80 },
            { name: 'Bench Press', sets: 3, reps: 12, weight: 60 },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.type).toBe('workout');
      expect(res.body.exercises).toHaveLength(2);
      expect(res.body.exercises[0].name).toBe('Squat');
    });
  });

  describe('GET /api/activities', () => {
    test('✅ Devrait récupérer les activités de l utilisateur', async () => {
      for (let i = 0; i < 3; i++) {
        await Activity.create({
          user: user._id,
          type: 'running',
          title: `Course ${i + 1}`,
          distance: 5,
          duration: 30,
          date: new Date(),
          source: 'manual',
        });
      }

      const res = await request(app)
        .get('/api/activities')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(3);
      expect(res.body[0].user.toString()).toBe(user._id.toString());
    });

    test('✅ Devrait retourner un tableau vide si aucune activité', async () => {
      const res = await request(app)
        .get('/api/activities')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    test('❌ Devrait rejeter sans authentification', async () => {
      const res = await request(app)
        .get('/api/activities');

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/activities/:id', () => {
    test('✅ Devrait supprimer une activité', async () => {
      const activity = await Activity.create({
        user: user._id,
        type: 'running',
        title: 'Course à supprimer',
        distance: 5,
        duration: 30,
        date: new Date(),
        source: 'manual',
      });

      const res = await request(app)
        .delete(`/api/activities/${activity._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);

      const check = await Activity.findById(activity._id);
      expect(check).toBeNull();
    });

    test('❌ Devrait retourner 404 si activité inexistante', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const res = await request(app)
        .delete(`/api/activities/${fakeId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    test('❌ Devrait rejeter sans authentification', async () => {
      const activity = await Activity.create({
        user: user._id,
        type: 'running',
        title: 'Course test',
        distance: 5,
        duration: 30,
        date: new Date(),
        source: 'manual',
      });

      const res = await request(app)
        .delete(`/api/activities/${activity._id}`);

      expect(res.status).toBe(401);
    });
  });
});
