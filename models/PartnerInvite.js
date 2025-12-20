const mongoose = require('mongoose');

const partnerInviteSchema = new mongoose.Schema(
  {
    fromUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    toUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    slot: {
      type: String,
      enum: ['p1', 'p2'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'refused', 'cancelled'],
      default: 'pending',
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

partnerInviteSchema.index({ fromUser: 1, toUser: 1, slot: 1, status: 1 });

module.exports = mongoose.model('PartnerInvite', partnerInviteSchema);
