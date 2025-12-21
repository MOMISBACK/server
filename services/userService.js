const User = require('../models/User');
const PartnerInvite = require('../models/PartnerInvite');

/**
 * Creates a new user in the database.
 * @param {string} email - The user's email.
 * @param {string} password - The user's password.
 * @returns {Promise<User>} The created user object.
 */
const createUser = async (email, password) => {
  return await User.create({ email, password });
};

/**
 * Finds a user by their email.
 * @param {string} email - The user's email.
 * @returns {Promise<User|null>} The found user object or null.
 */
const findUserByEmail = async (email) => {
  return await User.findOne({ email });
};

/**
 * Finds a user by their ID.
 * @param {string} id - The user's ID.
 * @returns {Promise<User|null>} The found user object or null.
 */
const getUserById = async (id) => {
  return await User.findById(id).select('-password');
};

/**
 * Retrieves all users from the database.
 * @returns {Promise<User[]>} An array of user objects.
 */
const getAllUsers = async () => {
  return await User.find({}).select('-password');
};

/**
 * Gets user with populated partner links
 */
const getUserWithPartnerLinks = async (userId) => {
  return await User.findById(userId)
    .select('-password')
    .populate('partnerLinks.partnerId', 'email totalDiamonds');
};

/**
 * Updates user's partner links (P1, P2 slots)
 * @param {string} userId - The user's ID
 * @param {object} data - { p1: userId|null, p2: userId|null }
 */
const updateUserPartnerLinks = async (userId, data) => {
  const { p1, p2 } = data;

  // Compute which partners are being removed so we can also unlink them reciprocally.
  const existingUser = await User.findById(userId).select('partnerLinks');
  const existingPartnerIds = new Set(
    ((existingUser?.partnerLinks || [])
      .filter((l) => l?.partnerId)
      .map((l) => l.partnerId.toString()))
  );
  const nextPartnerIds = new Set([p1, p2].filter(Boolean).map((id) => id.toString()));
  const removedPartnerIds = [...existingPartnerIds].filter((id) => !nextPartnerIds.has(id));

  const newPartnerLinks = [];

  if (p1) {
    newPartnerLinks.push({
      slot: 'p1',
      partnerId: p1,
      status: 'confirmed',
    });
  }

  if (p2) {
    newPartnerLinks.push({
      slot: 'p2',
      partnerId: p2,
      status: 'confirmed',
    });
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { partnerLinks: newPartnerLinks },
    { new: true }
  )
    .select('-password')
    .populate('partnerLinks.partnerId', 'email totalDiamonds');

  // Also remove any reciprocal links left on the removed partners.
  // Otherwise, user A can clear B, but B still has a confirmed/pending link to A,
  // which blocks future invites with a "déjà lié" error.
  if (removedPartnerIds.length > 0) {
    await Promise.all(
      removedPartnerIds.map(async (partnerId) => {
        await User.updateOne(
          { _id: partnerId },
          { $pull: { partnerLinks: { partnerId: userId } } },
        );

        // Cancel any pending invites both ways between the two users.
        await PartnerInvite.updateMany(
          {
            status: 'pending',
            $or: [
              { fromUser: userId, toUser: partnerId },
              { fromUser: partnerId, toUser: userId },
            ],
          },
          { $set: { status: 'cancelled' } },
        );
      }),
    );
  }

  return user;
};

/**
 * Updates active slot
 */
const updateUserActiveSlot = async (userId, activeSlot) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { activeSlot, hasSelectedSlot: true },
    { new: true }
  )
    .select('-password')
    .populate('partnerLinks.partnerId', 'email totalDiamonds');

  return user;
};

const sendPartnerInvite = async ({ fromUserId, toUserId, slot }) => {
  if (!['p1', 'p2'].includes(slot)) {
    throw new Error('Slot invalide');
  }

  if (!toUserId) {
    throw new Error('partnerId requis');
  }

  if (fromUserId.toString() === toUserId.toString()) {
    throw new Error('Vous ne pouvez pas être votre propre partenaire');
  }

  const toUser = await User.findById(toUserId);
  if (!toUser) {
    throw new Error('Utilisateur partenaire introuvable');
  }

  const fromUser = await User.findById(fromUserId);
  if (!fromUser) {
    throw new Error('Utilisateur introuvable');
  }

  const toUserHasFromUser = (toUser.partnerLinks || []).some((l) => {
    if (!l?.partnerId) return false;
    const isSamePartner = l.partnerId.toString() === fromUserId.toString();
    const isActiveRelationship = l.status === 'pending' || l.status === 'confirmed';
    return isSamePartner && isActiveRelationship;
  });

  const fromUserHasToUser = (fromUser.partnerLinks || []).some((l) => {
    if (!l?.partnerId) return false;
    const isSamePartner = l.partnerId.toString() === toUserId.toString();
    const isActiveRelationship = l.status === 'pending' || l.status === 'confirmed';
    return isSamePartner && isActiveRelationship;
  });

  // Only block when the relationship is actually mutual.
  // If the recipient has a stale one-sided link (common after older unlink flows), clean it.
  if (toUserHasFromUser && fromUserHasToUser) {
    throw new Error('Vous êtes déjà lié à ce partenaire sur un autre slot');
  }
  if (toUserHasFromUser && !fromUserHasToUser) {
    // If the recipient has an actual pending invite to the sender, this is not stale.
    const pendingInviteFromRecipient = await PartnerInvite.findOne({
      fromUser: toUserId,
      toUser: fromUserId,
      status: 'pending',
    });
    if (pendingInviteFromRecipient) {
      throw new Error('Vous êtes déjà lié à ce partenaire sur un autre slot');
    }

    toUser.partnerLinks = (toUser.partnerLinks || []).filter((l) => {
      if (!l?.partnerId) return true;
      return l.partnerId.toString() !== fromUserId.toString();
    });
    await toUser.save();
  }

  const existingSlot = (fromUser.partnerLinks || []).find((l) => l.slot === slot);
  if (existingSlot?.partnerId) {
    throw new Error('Ce slot est déjà utilisé (invitation en attente ou partenaire confirmé)');
  }

  const samePartnerOtherSlot = (fromUser.partnerLinks || []).find((l) => {
    if (!l?.partnerId) return false;
    const isSamePartner = l.partnerId.toString() === toUserId.toString();
    const isOtherSlot = l.slot !== slot;
    const isActiveRelationship = l.status === 'pending' || l.status === 'confirmed';
    return isSamePartner && isOtherSlot && isActiveRelationship;
  });
  if (samePartnerOtherSlot) {
    throw new Error('Ce partenaire est déjà utilisé sur un autre slot');
  }

  const existingInviteOtherSlot = await PartnerInvite.findOne({
    fromUser: fromUserId,
    toUser: toUserId,
    slot: { $ne: slot },
    status: 'pending',
  });
  if (existingInviteOtherSlot) {
    throw new Error('Une invitation est déjà en attente pour ce partenaire sur un autre slot');
  }

  const existingInvite = await PartnerInvite.findOne({
    fromUser: fromUserId,
    toUser: toUserId,
    slot,
    status: 'pending',
  });
  if (existingInvite) {
    throw new Error('Invitation déjà envoyée');
  }

  const invite = await PartnerInvite.create({
    fromUser: fromUserId,
    toUser: toUserId,
    slot,
    status: 'pending',
  });

  fromUser.partnerLinks = (fromUser.partnerLinks || []).filter((l) => l.slot !== slot);
  fromUser.partnerLinks.push({ slot, partnerId: toUserId, status: 'pending' });
  await fromUser.save();

  return invite;
};

const getIncomingPartnerInvites = async ({ userId }) => {
  const invites = await PartnerInvite.find({ toUser: userId, status: 'pending' })
    .populate('fromUser', 'email totalDiamonds')
    .sort({ createdAt: -1 });

  return invites;
};

const acceptPartnerInvite = async ({ inviteId, userId }) => {
  const invite = await PartnerInvite.findById(inviteId);
  if (!invite) {
    throw new Error('Invitation introuvable');
  }

  if (invite.toUser.toString() !== userId.toString()) {
    throw new Error('Accès refusé');
  }

  if (invite.status !== 'pending') {
    throw new Error('Invitation déjà traitée');
  }

  // If the sender cancelled locally (cleared partnerLinks) but the invite doc somehow
  // remained pending, do NOT allow a one-sided confirmation.
  const senderBeforeAccept = await User.findById(invite.fromUser).select('partnerLinks');
  const senderStillHasPendingLink = Boolean(
    (senderBeforeAccept?.partnerLinks || []).some((l) => {
      if (l.slot !== invite.slot) return false;
      if (!l.partnerId) return false;
      const isSamePartner = l.partnerId.toString() === invite.toUser.toString();
      return isSamePartner && l.status === 'pending';
    }),
  );
  if (!senderStillHasPendingLink) {
    invite.status = 'cancelled';
    await invite.save();
    throw new Error('Invitation annulée');
  }

  invite.status = 'accepted';
  await invite.save();

  // Confirm on sender side
  const sender = await User.findById(invite.fromUser);
  if (sender) {
    sender.partnerLinks = (sender.partnerLinks || []).map((l) => {
      if (
        l.slot === invite.slot &&
        l.partnerId &&
        l.partnerId.toString() === invite.toUser.toString()
      ) {
        return { ...l.toObject(), status: 'confirmed' };
      }
      return l;
    });
    await sender.save();
  }

  // ✅ Also confirm on recipient side (so they can use the slot for DUO challenges)
  const recipient = await User.findById(invite.toUser);
  if (recipient) {
    const existing = (recipient.partnerLinks || []).find((l) => l.slot === invite.slot);
    if (existing?.partnerId && existing.partnerId.toString() !== invite.fromUser.toString()) {
      throw new Error('Ce slot est déjà utilisé sur votre compte');
    }

    recipient.partnerLinks = (recipient.partnerLinks || []).filter((l) => l.slot !== invite.slot);
    recipient.partnerLinks.push({ slot: invite.slot, partnerId: invite.fromUser, status: 'confirmed' });
    await recipient.save();
  }

  return invite;
};

const refusePartnerInvite = async ({ inviteId, userId }) => {
  const invite = await PartnerInvite.findById(inviteId);
  if (!invite) {
    throw new Error('Invitation introuvable');
  }

  if (invite.toUser.toString() !== userId.toString()) {
    throw new Error('Accès refusé');
  }

  if (invite.status !== 'pending') {
    throw new Error('Invitation déjà traitée');
  }

  invite.status = 'refused';
  await invite.save();

  // Defensive cleanup: refusing must never result in a visible/active partnership.
  // Remove any partnerLinks between the two users (any slot, any status) on BOTH sides,
  // to guard against stale/one-sided links from older flows.
  await Promise.all([
    User.updateOne(
      { _id: invite.fromUser },
      { $pull: { partnerLinks: { partnerId: invite.toUser } } },
    ),
    User.updateOne(
      { _id: invite.toUser },
      { $pull: { partnerLinks: { partnerId: invite.fromUser } } },
    ),
    // Also cancel any other pending invites both ways (keeps UI consistent).
    PartnerInvite.updateMany(
      {
        status: 'pending',
        $or: [
          { fromUser: invite.fromUser, toUser: invite.toUser },
          { fromUser: invite.toUser, toUser: invite.fromUser },
        ],
      },
      { $set: { status: 'cancelled' } },
    ),
  ]);

  return invite;
};

module.exports = {
  createUser,
  findUserByEmail,
  getUserById,
  getAllUsers,
  getUserWithPartnerLinks,
  updateUserPartnerLinks,
  updateUserActiveSlot,
  sendPartnerInvite,
  getIncomingPartnerInvites,
  acceptPartnerInvite,
  refusePartnerInvite,
};
