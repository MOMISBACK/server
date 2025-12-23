const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const { createTestUserWithToken } = require('./helpers/authHelper');

describe('👤 Username (pseudo) flows', () => {
  describe('POST /api/auth/register', () => {
    test('✅ registers with username and returns it', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'john_doe',
          email: `john_${Date.now()}@example.com`,
          password: 'Password123!',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('email');
      expect(res.body.username).toBe('john_doe');

      const created = await User.findOne({ email: res.body.email });
      expect(created).toBeTruthy();
      expect(created.totalDiamonds).toBe(200);
    });

    test('❌ rejects missing username', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: `nousername_${Date.now()}@example.com`,
          password: 'Password123!',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Invalid input');
    });

    test('❌ rejects invalid username format', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'bad-name',
          email: `badname_${Date.now()}@example.com`,
          password: 'Password123!',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Invalid input');
    });

    test('❌ rejects duplicate username (case-insensitive)', async () => {
      const baseEmail = `dup_${Date.now()}`;

      const first = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'UserName',
          email: `${baseEmail}_1@example.com`,
          password: 'Password123!',
        });

      expect(first.status).toBe(201);
      expect(first.body.username).toBe('username');

      const second = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'username',
          email: `${baseEmail}_2@example.com`,
          password: 'Password123!',
        });

      expect(second.status).toBe(400);
      expect(second.body.message).toBe('Username already taken');
    });
  });

  describe('POST /api/auth/login', () => {
    test('✅ login returns username when set', async () => {
      const { user } = await createTestUserWithToken();

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: 'Password123!' });

      expect(res.status).toBe(200);
      expect(res.body.username).toBe(user.username);
      expect(res.body).toHaveProperty('token');
    });

    test('✅ login works even if legacy user has no username', async () => {
      const email = `legacy_${Date.now()}@example.com`;
      await User.create({ email, password: 'Password123!' });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'Password123!' });

      expect(res.status).toBe(200);
      expect(res.body.email).toBe(email);
      expect(res.body.username).toBeUndefined();
      expect(res.body).toHaveProperty('token');
    });
  });

  describe('PUT /api/users/username', () => {
    test('❌ rejects without auth', async () => {
      const res = await request(app).put('/api/users/username').send({ username: 'abc_123' });
      expect(res.status).toBe(401);
    });

    test('❌ rejects invalid username', async () => {
      const { token } = await createTestUserWithToken();

      const res = await request(app)
        .put('/api/users/username')
        .set('Authorization', `Bearer ${token}`)
        .send({ username: 'ab' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('✅ normalizes username (trim + lowercase)', async () => {
      const { token } = await createTestUserWithToken();

      const res = await request(app)
        .put('/api/users/username')
        .set('Authorization', `Bearer ${token}`)
        .send({ username: '  AbC_12  ' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.username).toBe('abc_12');
    });

    test('❌ rejects duplicate username', async () => {
      const { token: token1 } = await createTestUserWithToken();
      const { token: token2 } = await createTestUserWithToken();

      const first = await request(app)
        .put('/api/users/username')
        .set('Authorization', `Bearer ${token1}`)
        .send({ username: 'unique_name' });

      expect(first.status).toBe(200);
      expect(first.body.data.user.username).toBe('unique_name');

      const second = await request(app)
        .put('/api/users/username')
        .set('Authorization', `Bearer ${token2}`)
        .send({ username: 'unique_name' });

      expect(second.status).toBe(400);
      expect(second.body.success).toBe(false);
      expect(second.body.message).toBe('Username already taken');
    });
  });
});
