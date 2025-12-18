const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const activityRoutes = require('../routes/activityRoutes');
const { errorHandler } = require('../middleware/errorMiddleware');
const Activity = require('../models/Activity');
const authMiddleware = require('../middleware/authMiddleware');

// --- Auto-mock du middleware d'authentification ---
// Jest remplacera automatiquement `protect` par une fonction de mock.
jest.mock('../middleware/authMiddleware');

// --- Identifiants statiques pour simuler deux utilisateurs différents ---
const USER_ONE_ID = new mongoose.Types.ObjectId().toString();
const USER_TWO_ID = new mongoose.Types.ObjectId().toString();

// --- Création d'une instance d'application Express pour les tests ---
const app = express();
app.use(express.json());
app.use('/api/activities', activityRoutes);
app.use(errorHandler);


describe('Activity Controller - E2E Tests', () => {

  beforeEach(async () => {
    await Activity.deleteMany({}); // Nettoie la collection des activités

    // Configure l'implémentation du mock pour simuler USER_ONE par défaut avant chaque test.
    authMiddleware.protect.mockImplementation((req, res, next) => {
      req.user = { id: USER_ONE_ID };
      next();
    });
  });


  // =================================================================
  // SUITE DE TESTS POUR POST /api/activities
  // =================================================================
  describe('POST /api/activities', () => {
    it('should create a new activity for the authenticated user and return 201', async () => {
      const newActivity = {
        title: 'Morning Workout',
        type: 'workout',
        duration: 45,
        date: new Date().toISOString(),
        source: 'manual',
        exercises: [{ name: 'Push-ups', sets: 3, reps: 15 }],
      };

      const response = await request(app)
        .post('/api/activities')
        .send(newActivity);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('_id');
      expect(response.body.title).toBe(newActivity.title);
      expect(response.body.user).toBe(USER_ONE_ID);

      const savedActivity = await Activity.findById(response.body._id);
      expect(savedActivity).not.toBeNull();
      expect(savedActivity.title).toBe(newActivity.title);
    });

    it('should return 400 validation error if required field "title" is missing', async () => {
      const invalidActivity = {
        type: 'workout',
        duration: 60,
        date: new Date().toISOString(),
      };

      const response = await request(app)
        .post('/api/activities')
        .send(invalidActivity);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Validation failed');
      expect(response.body.details).toHaveProperty('title');
    });
  });


  // =================================================================
  // SUITE DE TESTS POUR GET /api/activities
  // =================================================================
  describe('GET /api/activities', () => {
    it('should return only activities belonging to the authenticated user', async () => {
      await Activity.create([
        { user: USER_ONE_ID, title: 'My Run', type: 'running', duration: 30, date: new Date(), source: 'manual' },
        { user: USER_TWO_ID, title: 'Other User\'s Swim', type: 'swimming', duration: 45, date: new Date(), source: 'manual' },
        { user: USER_ONE_ID, title: 'My Cycling', type: 'cycling', duration: 60, date: new Date(), source: 'manual' },
      ]);

      const response = await request(app).get('/api/activities');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0].user).toBe(USER_ONE_ID);
      expect(response.body[1].user).toBe(USER_ONE_ID);
      expect(response.body.some(act => act.title.includes('Other User'))).toBe(false);
    });

    it('should return an empty array if the user has no activities', async () => {
      const response = await request(app).get('/api/activities');
      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });
  });


  // =================================================================
  // SUITE DE TESTS POUR DELETE /api/activities/:id
  // =================================================================
  describe('DELETE /api/activities/:id', () => {
    let userOneActivity;

    beforeEach(async () => {
      userOneActivity = await Activity.create({
        user: USER_ONE_ID,
        title: 'Activity to Delete',
        type: 'walking',
        duration: 15,
        date: new Date(),
        source: 'manual',
      });
    });

    it('should delete the activity if it belongs to the user and return 200', async () => {
      const response = await request(app)
        .delete(`/api/activities/${userOneActivity._id}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Activity deleted successfully');

      const deletedActivity = await Activity.findById(userOneActivity._id);
      expect(deletedActivity).toBeNull();
    });

    it('should return 404 if the activity to delete does not exist', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .delete(`/api/activities/${nonExistentId}`);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Activity not found');
    });

    it('should return 403 if the user tries to delete an activity of another user', async () => {
      const userTwoActivity = await Activity.create({
        user: USER_TWO_ID,
        title: 'Protected Activity',
        type: 'running',
        duration: 30,
        date: new Date(),
        source: 'manual',
      });

      const response = await request(app)
        .delete(`/api/activities/${userTwoActivity._id}`);

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('User not authorized to delete this activity');

      const activityInDb = await Activity.findById(userTwoActivity._id);
      expect(activityInDb).not.toBeNull();
    });
  });
});
