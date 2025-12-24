// server/models/DiamondTransaction.js

const mongoose = require('mongoose');

const diamondTransactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    amount: {
      // Positive = credit, negative = debit
      type: Number,
      required: true,
    },
    kind: {
      type: String,
      enum: ['stake_hold', 'stake_refund', 'stake_burn', 'stake_payout', 'daily_chest', 'admin', 'other'],
      required: true,
      index: true,
    },
    refModel: {
      type: String,
      default: 'WeeklyChallenge',
    },
    refId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
    },
    note: {
      type: String,
      maxlength: 200,
    },
  },
  { timestamps: true }
);

diamondTransactionSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('DiamondTransaction', diamondTransactionSchema);
