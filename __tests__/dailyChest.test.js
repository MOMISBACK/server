const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const { createTestUserWithToken } = require('./helpers/authHelper');

describe('🎁 Daily chest', () => {
  test('POST /api/users/daily-chest - grants +5 diamonds once per 24h', async () => {
    const { user, token } = await createTestUserWithToken();

    const before = await User.findById(user._id).select('totalDiamonds dailyChestLastOpenedAt');
    expect(before.totalDiamonds).toBe(200);
    expect(before.dailyChestLastOpenedAt).toBeUndefined();

    const res1 = await request(app)
      .post('/api/users/daily-chest')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res1.status).toBe(200);
    expect(res1.body.success).toBe(true);
    expect(res1.body.data.reward).toBe(5);

    const after1 = await User.findById(user._id).select('totalDiamonds dailyChestLastOpenedAt');
    expect(after1.totalDiamonds).toBe(205);
    expect(after1.dailyChestLastOpenedAt).toBeTruthy();

    const res2 = await request(app)
      .post('/api/users/daily-chest')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res2.status).toBe(429);
    expect(res2.body.success).toBe(false);

    const after2 = await User.findById(user._id).select('totalDiamonds');
    expect(after2.totalDiamonds).toBe(205);
  });
});
