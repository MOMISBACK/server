const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const { createTestUserWithToken } = require('./helpers/authHelper');

describe('🎁 Daily chest', () => {
  test('POST /api/users/daily-chest - grants +1 diamond up to 3 times per day', async () => {
    const { user, token } = await createTestUserWithToken();

    const before = await User.findById(user._id).select('totalDiamonds dailyChestLastOpenedAt dailyChestClaimDate dailyChestClaimsToday');
    expect(before.totalDiamonds).toBe(200);
    expect(before.dailyChestLastOpenedAt).toBeUndefined();

    const res1 = await request(app)
      .post('/api/users/daily-chest')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res1.status).toBe(200);
    expect(res1.body.success).toBe(true);
    expect(res1.body.data.reward).toBe(5);
    expect(res1.body.data.dailyChestClaimsToday).toBe(1);
    expect(res1.body.data.claimsRemaining).toBe(2);

    const after1 = await User.findById(user._id).select('totalDiamonds dailyChestLastOpenedAt dailyChestClaimDate dailyChestClaimsToday');
    expect(after1.totalDiamonds).toBe(205);
    expect(after1.dailyChestLastOpenedAt).toBeTruthy();
    expect(after1.dailyChestClaimDate).toBeTruthy();
    expect(after1.dailyChestClaimsToday).toBe(1);

    const res2 = await request(app)
      .post('/api/users/daily-chest')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res2.status).toBe(200);
    expect(res2.body.success).toBe(true);
    expect(res2.body.data.reward).toBe(5);
    expect(res2.body.data.dailyChestClaimsToday).toBe(2);
    expect(res2.body.data.claimsRemaining).toBe(1);

    const res3 = await request(app)
      .post('/api/users/daily-chest')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res3.status).toBe(200);
    expect(res3.body.success).toBe(true);
    expect(res3.body.data.reward).toBe(5);
    expect(res3.body.data.dailyChestClaimsToday).toBe(3);
    expect(res3.body.data.claimsRemaining).toBe(0);

    const res4 = await request(app)
      .post('/api/users/daily-chest')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res4.status).toBe(429);
    expect(res4.body.success).toBe(false);
    expect(res4.body.data.claimsRemaining).toBe(0);

    // 200 initial + 3 claims * 5 diamonds = 215
    const after2 = await User.findById(user._id).select('totalDiamonds');
    expect(after2.totalDiamonds).toBe(215);
  });
});
