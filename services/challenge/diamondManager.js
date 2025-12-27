// server/services/challenge/diamondManager.js
// Module responsable de toutes les opérations sur les diamants (stake, payout, refund)

const User = require('../../models/User');
const DiamondTransaction = require('../../models/DiamondTransaction');

const STAKE_PER_PLAYER = 10;
const STAKE_PAYOUT_MULTIPLIER = 4;

/**
 * Log helper (disabled during tests)
 */
const _log = (...args) => {
  if (process.env.NODE_ENV === 'test') return;
  console.log(...args);
};

/**
 * Record a diamond transaction for audit purposes
 */
const recordDiamondTx = async ({ userId, amount, kind, refId, note }) => {
  try {
    await DiamondTransaction.create({
      user: userId,
      amount,
      kind,
      refId,
      note,
    });
  } catch (_) {
    // Non-blocking: never fail the main flow because of auditing
  }
};

/**
 * Debit diamonds from a user (throws if insufficient)
 */
const debitDiamondsOrThrow = async (userId, amount, meta = {}) => {
  if (!amount || amount <= 0) return;

  const res = await User.updateOne(
    { _id: userId, totalDiamonds: { $gte: amount } },
    { $inc: { totalDiamonds: -amount } }
  );

  if (!res || res.modifiedCount !== 1) {
    throw new Error('Diamants insuffisants');
  }

  await recordDiamondTx({
    userId,
    amount: -amount,
    kind: meta.kind || 'other',
    refId: meta.refId,
    note: meta.note,
  });
};

/**
 * Credit diamonds to a user
 */
const creditDiamonds = async (userId, amount, meta = {}) => {
  if (!amount || amount <= 0) return;
  await User.updateOne({ _id: userId }, { $inc: { totalDiamonds: amount } });
  await recordDiamondTx({
    userId,
    amount,
    kind: meta.kind || 'other',
    refId: meta.refId,
    note: meta.note,
  });
};

/**
 * Get stake entry for a user in a challenge
 */
const getStakeEntry = (challenge, userId) => {
  const stakes = Array.isArray(challenge?.stakes) ? challenge.stakes : [];
  return stakes.find((s) => s?.user?.toString?.() === userId.toString());
};

/**
 * Hold stake for a user (debit diamonds and add to challenge stakes)
 */
const holdStakeOrThrow = async (challenge, userId, amount) => {
  const existing = getStakeEntry(challenge, userId);
  if (existing && existing.status === 'held') return;

  await debitDiamondsOrThrow(userId, amount, {
    kind: 'stake_hold',
    refId: challenge?._id,
    note: 'Mise en jeu',
  });

  const stakes = Array.isArray(challenge.stakes) ? challenge.stakes : [];
  const next = stakes.filter((s) => s?.user?.toString?.() !== userId.toString());
  next.push({ user: userId, amount, status: 'held', updatedAt: new Date() });
  challenge.stakes = next;
  challenge.stakePerPlayer = amount;
};

/**
 * Refund stake if currently held
 */
const refundStakeIfHeld = async (challenge, userId) => {
  const entry = getStakeEntry(challenge, userId);
  if (!entry || entry.status !== 'held') return;

  await creditDiamonds(userId, entry.amount, {
    kind: 'stake_refund',
    refId: challenge?._id,
    note: 'Remboursement de mise',
  });

  entry.status = 'refunded';
  entry.updatedAt = new Date();
};

/**
 * Burn stake if currently held (no refund)
 */
const burnStakeIfHeld = (challenge, userId) => {
  const entry = getStakeEntry(challenge, userId);
  if (!entry || entry.status !== 'held') return;
  entry.status = 'burned';
  entry.updatedAt = new Date();
};

/**
 * Payout stake with multiplier if currently held
 */
const payoutStakeIfHeld = async (challenge, userId, multiplier) => {
  const entry = getStakeEntry(challenge, userId);
  if (!entry || entry.status !== 'held') return;

  const payout = entry.amount * multiplier;
  await creditDiamonds(userId, payout, {
    kind: 'stake_payout',
    refId: challenge?._id,
    note: `Gain pacte x${multiplier}`,
  });

  entry.status = 'paid';
  entry.updatedAt = new Date();
};

/**
 * Payout specific amount if stake is currently held
 */
const payoutStakeAmountIfHeld = async (challenge, userId, amount, meta = {}) => {
  const entry = getStakeEntry(challenge, userId);
  if (!entry || entry.status !== 'held') return;

  const payout = Number(amount);
  if (!Number.isFinite(payout) || payout < 0) return;

  await creditDiamonds(userId, payout, {
    kind: meta.kind || 'stake_payout',
    refId: challenge?._id,
    note: meta.note || 'Gain pacte',
  });

  entry.status = 'paid';
  entry.paidAmount = payout;
  entry.updatedAt = new Date();
};

/**
 * Refund specific amount if stake is currently held (remaining is burned)
 */
const refundStakeAmountIfHeld = async (challenge, userId, amount, meta = {}) => {
  const entry = getStakeEntry(challenge, userId);
  if (!entry || entry.status !== 'held') return;

  const refund = Number(amount);
  if (!Number.isFinite(refund) || refund < 0) return;

  const safeRefund = Math.min(refund, Number(entry.amount) || 0);
  if (safeRefund > 0) {
    await creditDiamonds(userId, safeRefund, {
      kind: meta.kind || 'stake_refund',
      refId: challenge?._id,
      note: meta.note || 'Remboursement de mise',
    });
  }

  const burned = Math.max(0, (Number(entry.amount) || 0) - safeRefund);
  if (burned > 0) {
    await recordDiamondTx({
      userId,
      amount: 0,
      kind: meta.burnKind || 'stake_burn',
      refId: challenge?._id,
      note: meta.burnNote || 'Mise brûlée',
    });
  }

  entry.status = safeRefund > 0 ? 'refunded' : 'burned';
  entry.refundedAmount = safeRefund;
  entry.burnedAmount = burned;
  entry.updatedAt = new Date();
};

module.exports = {
  STAKE_PER_PLAYER,
  STAKE_PAYOUT_MULTIPLIER,
  _log,
  recordDiamondTx,
  debitDiamondsOrThrow,
  creditDiamonds,
  getStakeEntry,
  holdStakeOrThrow,
  refundStakeIfHeld,
  burnStakeIfHeld,
  payoutStakeIfHeld,
  payoutStakeAmountIfHeld,
  refundStakeAmountIfHeld,
};
