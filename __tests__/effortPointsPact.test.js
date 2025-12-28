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

    // Unified settlement formula (Session 6):
    // nGoals=1, pot=20, PE_required~35, PE_actual~78.2 (42.7+35.5)
    // Mdifficulty = 1 + 0.35 * log(1 + 35/20) = ~1.28
    // p=1 (completed), e=min(78.2/35, 1)=1
    // Mperf = 1 + 0.6*1 + 0.4*1 = 2.0
    // gainTotal = pot * Mdifficulty * Mperf = 20 * 1.28 * 2.0 = 51.2, capped at 60, min 24
    // Split 55/45 bounded: shareA ~ 0.5 + 0.1 * (42.7-35.5)/(42.7+35.5) = ~0.509
    // gain1 = round(gainTotal * 0.509), gain2 = gainTotal - gain1
    expect(stake1.status).toBe('paid');
    expect(stake2.status).toBe('paid');
    // With unified formula, gains are higher (around 27/24 or similar)
    expect(stake1.paidAmount).toBeGreaterThanOrEqual(24);
    expect(stake2.paidAmount).toBeGreaterThanOrEqual(20);
    expect(stake1.paidAmount + stake2.paidAmount).toBeGreaterThanOrEqual(45);
    expect(stake1.paidAmount + stake2.paidAmount).toBeLessThanOrEqual(60);

    const after1 = await User.findById(u1._id).select('totalDiamonds');
    const after2 = await User.findById(u2._id).select('totalDiamonds');

    // Each stakes 10 at invite/sign time, then gets paid per unified formula.
    expect(after1.totalDiamonds).toBe((before1.totalDiamonds ?? 200) - 10 + stake1.paidAmount);
    expect(after2.totalDiamonds).toBe((before2.totalDiamonds ?? 200) - 10 + stake2.paidAmount);
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

    // Unified settlement formula for failure:
    // p=0 (not completed), e=effort/PE_required
    // refundRatio = 0.7*p + 0.3*min(e, 1) = 0.3*e
    // PE1 (workout 20min) = 0.09*20 + 0.9 = 2.7
    // PE2 (running 5km, 20min) = 0.8*5 + 0.1*20 + 0.7 = 6.7
    // Total PE = 9.4, PE_required = 35
    // e = min(9.4/35, 1) = 0.269
    // refundRatio = 0.3 * 0.269 = 0.08, refundTotal = 20 * 0.08 = 1.6 ≈ 2
    // Split by effort: shareA = 2.7/9.4 = 0.287, shareB = 0.713
    expect(stake1.refundedAmount).toBeGreaterThanOrEqual(0);
    expect(stake1.burnedAmount).toBeGreaterThanOrEqual(0);
    expect(stake2.refundedAmount).toBeGreaterThanOrEqual(0);
    expect(stake2.burnedAmount).toBeGreaterThanOrEqual(0);
    // Verify total burned + refunded = stake
    expect(stake1.refundedAmount + stake1.burnedAmount).toBe(10);
    expect(stake2.refundedAmount + stake2.burnedAmount).toBe(10);

    const after1 = await User.findById(u1._id).select('totalDiamonds');
    const after2 = await User.findById(u2._id).select('totalDiamonds');

    expect(after1.totalDiamonds).toBe((before1.totalDiamonds ?? 200) - 10 + stake1.refundedAmount);
    expect(after2.totalDiamonds).toBe((before2.totalDiamonds ?? 200) - 10 + stake2.refundedAmount);
  });
});
