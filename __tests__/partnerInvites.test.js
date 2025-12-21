const request = require('supertest');
const express = require('express');
const userRoutes = require('../routes/userRoutes');
const activityRoutes = require('../routes/activityRoutes');
const { createTestUserWithToken } = require('./helpers/authHelper');
const User = require('../models/User');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/users', userRoutes);
  app.use('/api/activities', activityRoutes);
  return app;
}

describe('👥 Partner Invites API', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  test('✅ send -> incoming -> accept confirms sender slot', async () => {
    const { user: userA, token: tokenA } = await createTestUserWithToken();
    const { user: userB, token: tokenB } = await createTestUserWithToken();

    const sendRes = await request(app)
      .post('/api/users/partner-invites')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ slot: 'p1', partnerId: userB._id.toString() });

    expect(sendRes.status).toBe(200);
    expect(sendRes.body.success).toBe(true);
    expect(sendRes.body.data.invite).toBeTruthy();

    const partnerLinksRes1 = await request(app)
      .get('/api/users/partner-links')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(partnerLinksRes1.status).toBe(200);
    const p1 = partnerLinksRes1.body.data.partnerLinks.find((l) => l.slot === 'p1');
    expect(p1).toBeTruthy();
    expect(p1.partnerId).toBe(userB._id.toString());
    expect(p1.status).toBe('pending');

    const incomingRes = await request(app)
      .get('/api/users/partner-invites/incoming')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(incomingRes.status).toBe(200);
    expect(incomingRes.body.success).toBe(true);
    expect(Array.isArray(incomingRes.body.data.invites)).toBe(true);
    expect(incomingRes.body.data.invites.length).toBe(1);

    const inviteId = incomingRes.body.data.invites[0]._id;

    const acceptRes = await request(app)
      .post(`/api/users/partner-invites/${inviteId}/accept`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.success).toBe(true);

    const partnerLinksRes2 = await request(app)
      .get('/api/users/partner-links')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(partnerLinksRes2.status).toBe(200);
    const p1After = partnerLinksRes2.body.data.partnerLinks.find((l) => l.slot === 'p1');
    expect(p1After).toBeTruthy();
    expect(p1After.partnerId).toBe(userB._id.toString());
    expect(p1After.status).toBe('confirmed');

    // Recipient should also have the confirmed link on the same slot.
    const partnerLinksResRecipient = await request(app)
      .get('/api/users/partner-links')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(partnerLinksResRecipient.status).toBe(200);
    const p1Recipient = partnerLinksResRecipient.body.data.partnerLinks.find((l) => l.slot === 'p1');
    expect(p1Recipient).toBeTruthy();
    expect(p1Recipient.partnerId).toBe(userA._id.toString());
    expect(p1Recipient.status).toBe('confirmed');

    // Bonus: shared activities endpoint must be gated by confirmed links
    const sharedRes = await request(app)
      .get(`/api/activities/shared/${userB._id.toString()}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(sharedRes.status).toBe(200);
    expect(Array.isArray(sharedRes.body)).toBe(true);
  });

  test('✅ refuse clears sender slot', async () => {
    const { user: userA, token: tokenA } = await createTestUserWithToken();
    const { user: userB, token: tokenB } = await createTestUserWithToken();

    await request(app)
      .post('/api/users/partner-invites')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ slot: 'p2', partnerId: userB._id.toString() });

    const incomingRes = await request(app)
      .get('/api/users/partner-invites/incoming')
      .set('Authorization', `Bearer ${tokenB}`);

    const inviteId = incomingRes.body.data.invites[0]._id;

    const refuseRes = await request(app)
      .post(`/api/users/partner-invites/${inviteId}/refuse`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(refuseRes.status).toBe(200);

    const partnerLinksRes = await request(app)
      .get('/api/users/partner-links')
      .set('Authorization', `Bearer ${tokenA}`);

    const p2 = partnerLinksRes.body.data.partnerLinks.find((l) => l.slot === 'p2');
    expect(p2).toBeFalsy();
  });

  test('✅ cancel (clear slot) prevents later accept (no one-sided partner)', async () => {
    const { user: userA, token: tokenA } = await createTestUserWithToken();
    const { user: userB, token: tokenB } = await createTestUserWithToken();

    const sendRes = await request(app)
      .post('/api/users/partner-invites')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ slot: 'p1', partnerId: userB._id.toString() });

    expect(sendRes.status).toBe(200);

    // Grab invite id before cancellation (simulates recipient holding the id)
    const incomingBefore = await request(app)
      .get('/api/users/partner-invites/incoming')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(incomingBefore.status).toBe(200);
    expect(incomingBefore.body.data.invites.length).toBe(1);
    const inviteId = incomingBefore.body.data.invites[0]._id;

    // Sender cancels by clearing partner links
    const cancelRes = await request(app)
      .put('/api/users/partner-links')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ p1: null, p2: null });

    expect(cancelRes.status).toBe(200);

    // Recipient tries to accept the now-cancelled invite id
    const acceptAfterCancel = await request(app)
      .post(`/api/users/partner-invites/${inviteId}/accept`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(acceptAfterCancel.status).toBe(400);

    // Recipient must not end up with a confirmed link
    const linksB = await request(app)
      .get('/api/users/partner-links')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(linksB.status).toBe(200);
    const anyLinkToA = (linksB.body.data.partnerLinks || []).find((l) => l.partnerId === userA._id.toString());
    expect(anyLinkToA).toBeFalsy();
  });

  test('✅ refuse removes any stale links both sides (defensive)', async () => {
    const { user: userA, token: tokenA } = await createTestUserWithToken();
    const { user: userB, token: tokenB } = await createTestUserWithToken();

    // A sends an invite on p2
    await request(app)
      .post('/api/users/partner-invites')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ slot: 'p2', partnerId: userB._id.toString() });

    // Simulate a corrupted/stale state where A also has a confirmed link to B elsewhere,
    // and B has a one-sided confirmed link back to A.
    await User.updateOne(
      { _id: userA._id },
      {
        $push: {
          partnerLinks: { slot: 'p1', partnerId: userB._id, status: 'confirmed' },
        },
      },
    );
    await User.updateOne(
      { _id: userB._id },
      {
        $push: {
          partnerLinks: { slot: 'p1', partnerId: userA._id, status: 'confirmed' },
        },
      },
    );

    const incomingRes = await request(app)
      .get('/api/users/partner-invites/incoming')
      .set('Authorization', `Bearer ${tokenB}`);

    const inviteId = incomingRes.body.data.invites[0]._id;

    const refuseRes = await request(app)
      .post(`/api/users/partner-invites/${inviteId}/refuse`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(refuseRes.status).toBe(200);

    const aLinks = await request(app)
      .get('/api/users/partner-links')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(aLinks.status).toBe(200);
    expect(aLinks.body.data.partnerLinks.some((l) => l.partnerId === userB._id.toString())).toBe(false);

    const bLinks = await request(app)
      .get('/api/users/partner-links')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(bLinks.status).toBe(200);
    expect(bLinks.body.data.partnerLinks.some((l) => l.partnerId === userA._id.toString())).toBe(false);
  });

  test('❌ cannot invite yourself', async () => {
    const { user: userA, token: tokenA } = await createTestUserWithToken();

    const sendRes = await request(app)
      .post('/api/users/partner-invites')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ slot: 'p1', partnerId: userA._id.toString() });

    expect(sendRes.status).toBe(400);
  });

  test('❌ cannot reuse occupied slot while pending', async () => {
    const { user: userA, token: tokenA } = await createTestUserWithToken();
    const { user: userB } = await createTestUserWithToken();
    const { user: userC } = await createTestUserWithToken();

    const first = await request(app)
      .post('/api/users/partner-invites')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ slot: 'p1', partnerId: userB._id.toString() });

    expect(first.status).toBe(200);

    const second = await request(app)
      .post('/api/users/partner-invites')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ slot: 'p1', partnerId: userC._id.toString() });

    expect(second.status).toBe(400);
  });

  test('❌ cannot invite same user on two slots', async () => {
    const { user: userA, token: tokenA } = await createTestUserWithToken();
    const { user: userB } = await createTestUserWithToken();

    const first = await request(app)
      .post('/api/users/partner-invites')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ slot: 'p1', partnerId: userB._id.toString() });

    expect(first.status).toBe(200);

    const second = await request(app)
      .post('/api/users/partner-invites')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ slot: 'p2', partnerId: userB._id.toString() });

    expect(second.status).toBe(400);
  });

  test('❌ cannot invite a user who already has you on the other slot (reciprocal)', async () => {
    const { user: userA, token: tokenA } = await createTestUserWithToken();
    const { user: userB, token: tokenB } = await createTestUserWithToken();

    const first = await request(app)
      .post('/api/users/partner-invites')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ slot: 'p1', partnerId: userA._id.toString() });

    expect(first.status).toBe(200);

    const second = await request(app)
      .post('/api/users/partner-invites')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ slot: 'p2', partnerId: userB._id.toString() });

    expect(second.status).toBe(400);
  });

  test('❌ only the invite recipient can accept/refuse', async () => {
    const { user: userA, token: tokenA } = await createTestUserWithToken();
    const { user: userB, token: tokenB } = await createTestUserWithToken();
    const { user: userC, token: tokenC } = await createTestUserWithToken();

    await request(app)
      .post('/api/users/partner-invites')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ slot: 'p1', partnerId: userB._id.toString() });

    const incomingResC = await request(app)
      .get('/api/users/partner-invites/incoming')
      .set('Authorization', `Bearer ${tokenC}`);

    // userC is not recipient, should have no incoming invites
    expect(incomingResC.status).toBe(200);
    expect(incomingResC.body.data.invites.length).toBe(0);

    const incomingResB = await request(app)
      .get('/api/users/partner-invites/incoming')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(incomingResB.status).toBe(200);
    expect(incomingResB.body.data.invites.length).toBe(1);
    const inviteId = incomingResB.body.data.invites[0]._id;

    const acceptAsC = await request(app)
      .post(`/api/users/partner-invites/${inviteId}/accept`)
      .set('Authorization', `Bearer ${tokenC}`);

    expect(acceptAsC.status).toBe(400);
  });

  test('✅ unlink from one side clears reciprocal link (can re-invite)', async () => {
    const { user: userA, token: tokenA } = await createTestUserWithToken();
    const { user: userB, token: tokenB } = await createTestUserWithToken();

    // Create + accept a confirmed partnership on p1
    const sendRes = await request(app)
      .post('/api/users/partner-invites')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ slot: 'p1', partnerId: userB._id.toString() });

    expect(sendRes.status).toBe(200);

    const incomingRes = await request(app)
      .get('/api/users/partner-invites/incoming')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(incomingRes.status).toBe(200);
    expect(incomingRes.body.data.invites.length).toBe(1);

    const inviteId = incomingRes.body.data.invites[0]._id;
    const acceptRes = await request(app)
      .post(`/api/users/partner-invites/${inviteId}/accept`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(acceptRes.status).toBe(200);

    // UserA clears links
    const clearRes = await request(app)
      .put('/api/users/partner-links')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ p1: null, p2: null });

    expect(clearRes.status).toBe(200);
    expect(Array.isArray(clearRes.body.data.partnerLinks)).toBe(true);
    expect(clearRes.body.data.partnerLinks.length).toBe(0);

    // UserB should no longer have a reciprocal link to UserA
    const linksB = await request(app)
      .get('/api/users/partner-links')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(linksB.status).toBe(200);
    const anyToA = linksB.body.data.partnerLinks.find((l) => l.partnerId === userA._id.toString());
    expect(anyToA).toBeFalsy();

    // Re-inviting should work now (no stale reciprocal "déjà lié")
    const sendAgain = await request(app)
      .post('/api/users/partner-invites')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ slot: 'p1', partnerId: userB._id.toString() });

    expect(sendAgain.status).toBe(200);
    expect(sendAgain.body.success).toBe(true);
  });

  test('✅ stale one-sided reciprocal link does not block invites', async () => {
    const { user: userA, token: tokenA } = await createTestUserWithToken();
    const { user: userB } = await createTestUserWithToken();

    // Simulate a stale link on userB pointing to userA (old inconsistent state)
    await User.updateOne(
      { _id: userB._id },
      {
        $set: {
          partnerLinks: [{ slot: 'p2', partnerId: userA._id, status: 'confirmed' }],
        },
      },
    );

    const sendRes = await request(app)
      .post('/api/users/partner-invites')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ slot: 'p1', partnerId: userB._id.toString() });

    expect(sendRes.status).toBe(200);
    expect(sendRes.body.success).toBe(true);
  });
});
