// server/__tests__/effortPointsPact.test.js

const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../models/User');
const WeeklyChallenge = require('../models/WeeklyChallenge');
const { createTestUserWithToken } = require('./helpers/authHelper');

afterAll(async () => {
  await mongoose.connection.close();
}, 10000);

const createTestApp = () => {
  const express = require('express');
  const app = express();
  app.use(express.json());

  const challengeRoutes = require('../routes/challengeRoutes');
  const activityRoutes = require('../routes/activityRoutes');
  app.use('/api/challenges', challengeRoutes);
  app.use('/api/activities', activityRoutes);

  return app;
};

async function activateDuoChallenge({ app, creatorToken, inviteeToken, inviteeId, payload }) {
  const createRes = await request(app)
    .post('/api/challenges')
    .set('Authorization', `Bearer ${creatorToken}`)
    .send({ mode: 'duo', partnerId: inviteeId, ...payload });

  expect(createRes.status).toBe(201);
  const challengeId = createRes.body.data._id;

  const signInviteeRes = await request(app)
    .post(`/api/challenges/${challengeId}/sign`)
    .set('Authorization', `Bearer ${inviteeToken}`)
    .send();
  expect(signInviteeRes.status).toBe(200);

  const refreshed = await WeeklyChallenge.findById(challengeId);
  expect(refreshed).toBeTruthy();
  expect(refreshed.status).toBe('active');

  return challengeId;
}

describe('⚡️ Pacte PE (effort_points) - Settlement', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  test('✅ Success: pays variable amounts (55/45 cap) and marks stake paidAmount', async () => {
    const { user: u1, token: t1 } = await createTestUserWithToken();
    const { user: u2, token: t2 } = await createTestUserWithToken();

    const before1 = await User.findById(u1._id).select('totalDiamonds');
    const before2 = await User.findById(u2._id).select('totalDiamonds');

    const challengeId = await activateDuoChallenge({
      app,
      creatorToken: t1,
      inviteeToken: t2,
      inviteeId: u2._id.toString(),
      payload: {
        goal: { type: 'effort_points', value: 35 },
        activityTypes: ['running'],
        title: 'Pacte PE',
        icon: 'flash-outline',
      },
    });

    // Make the challenge window expired but consistent, then create activities inside it.
    const endDate = new Date(Date.now() - 1000);
    const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    await WeeklyChallenge.updateOne(
      { _id: challengeId },
      { $set: { startDate, endDate } }
    );

    const activityDate = new Date(endDate.getTime() - 60 * 60 * 1000).toISOString();

    // User1: running 30km, 180min => PE = 0.8*30 + 0.1*180 + 0.7*1 = 42.7 -> r_cap=1.2
    const u1RunRes = await request(app)
      .post('/api/activities')
      .set('Authorization', `Bearer ${t1}`)
      .send({
        type: 'running',
        title: 'U1 run',
        duration: 180,
        distance: 30,
        date: activityDate,
        source: 'manual',
      });
    expect(u1RunRes.status).toBe(201);

    // User2: running 26km, 140min => PE = 20.8 + 14 + 0.7 = 35.5 -> r~1.014
    const u2RunRes = await request(app)
      .post('/api/activities')
      .set('Authorization', `Bearer ${t2}`)
      .send({
        type: 'running',
        title: 'U2 run',
        duration: 140,
        distance: 26,
        date: activityDate,
        source: 'manual',
      });
    expect(u2RunRes.status).toBe(201);

    const finalizeRes = await request(app)
      .post(`/api/challenges/${challengeId}/finalize`)
      .set('Authorization', `Bearer ${t1}`)
      .send();

    expect(finalizeRes.status).toBe(200);
    expect(finalizeRes.body.success).toBe(true);

    const settled = await WeeklyChallenge.findById(challengeId);
    expect(settled.status).toBe('completed');
    expect(settled.settlement.status).toBe('success');

    const stake1 = settled.stakes.find((s) => s.user.toString() === u1._id.toString());
    const stake2 = settled.stakes.find((s) => s.user.toString() === u2._id.toString());

    // Expected payouts with current formula:
    // pot=20, r1_cap=1.2, r2_cap=35.5/35=1.0142857
    // M ~= 1.2907 => gTotal=round(20*M)=26
    // pRaw=1.2/(1.2+1.0142857)=0.542... (within 45/55)
    // gain1=round(26*0.542..)=14, gain2=12
    expect(stake1.status).toBe('paid');
    expect(stake2.status).toBe('paid');
    expect(stake1.paidAmount).toBe(14);
    expect(stake2.paidAmount).toBe(12);

    const after1 = await User.findById(u1._id).select('totalDiamonds');
    const after2 = await User.findById(u2._id).select('totalDiamonds');

    // Each stakes 10 at invite/sign time, then gets paid as above.
    expect(after1.totalDiamonds).toBe((before1.totalDiamonds ?? 200) - 10 + 14);
    expect(after2.totalDiamonds).toBe((before2.totalDiamonds ?? 200) - 10 + 12);
  });

  test('❌ Failure: refunds are partial (rounded) and remainder is burned', async () => {
    const { user: u1, token: t1 } = await createTestUserWithToken();
    const { user: u2, token: t2 } = await createTestUserWithToken();

    const before1 = await User.findById(u1._id).select('totalDiamonds');
    const before2 = await User.findById(u2._id).select('totalDiamonds');

    const challengeId = await activateDuoChallenge({
      app,
      creatorToken: t1,
      inviteeToken: t2,
      inviteeId: u2._id.toString(),
      payload: {
        goal: { type: 'effort_points', value: 35 },
        activityTypes: ['running', 'workout'],
        title: 'Pacte PE fail',
        icon: 'flash-outline',
      },
    });

    const endDate = new Date(Date.now() - 1000);
    const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    await WeeklyChallenge.updateOne(
      { _id: challengeId },
      { $set: { startDate, endDate } }
    );

    const activityDate = new Date(endDate.getTime() - 60 * 60 * 1000).toISOString();

    // User1: running 10km, 70min => 15.7 ; workout 20min => 2.7 ; total 18.4
    // r = 18.4/35 = 0.5257 => refund = round(10*r)=5
    const u1RunRes = await request(app)
      .post('/api/activities')
      .set('Authorization', `Bearer ${t1}`)
      .send({
        type: 'running',
        title: 'U1 run',
        duration: 70,
        distance: 10,
        date: activityDate,
        source: 'manual',
      });
    expect(u1RunRes.status).toBe(201);

    const u1WorkoutRes = await request(app)
      .post('/api/activities')
      .set('Authorization', `Bearer ${t1}`)
      .send({
        type: 'workout',
        title: 'U1 workout',
        duration: 20,
        date: activityDate,
        source: 'manual',
      });
    expect(u1WorkoutRes.status).toBe(201);

    // User2: running 5km, 20min => 6.7
    // r = 6.7/35 = 0.1914 => refund = round(10*r)=2
    const u2RunRes = await request(app)
      .post('/api/activities')
      .set('Authorization', `Bearer ${t2}`)
      .send({
        type: 'running',
        title: 'U2 run',
        duration: 20,
        distance: 5,
        date: activityDate,
        source: 'manual',
      });
    expect(u2RunRes.status).toBe(201);

    const finalizeRes = await request(app)
      .post(`/api/challenges/${challengeId}/finalize`)
      .set('Authorization', `Bearer ${t1}`)
      .send();

    expect(finalizeRes.status).toBe(200);
    expect(finalizeRes.body.success).toBe(true);

    const settled = await WeeklyChallenge.findById(challengeId);
    expect(settled.status).toBe('failed');
    expect(settled.settlement.status).toBe('loss');

    const stake1 = settled.stakes.find((s) => s.user.toString() === u1._id.toString());
    const stake2 = settled.stakes.find((s) => s.user.toString() === u2._id.toString());

    expect(stake1.refundedAmount).toBe(5);
    expect(stake1.burnedAmount).toBe(5);
    expect(stake2.refundedAmount).toBe(2);
    expect(stake2.burnedAmount).toBe(8);

    const after1 = await User.findById(u1._id).select('totalDiamonds');
    const after2 = await User.findById(u2._id).select('totalDiamonds');

    expect(after1.totalDiamonds).toBe((before1.totalDiamonds ?? 200) - 10 + 5);
    expect(after2.totalDiamonds).toBe((before2.totalDiamonds ?? 200) - 10 + 2);
  });
});
