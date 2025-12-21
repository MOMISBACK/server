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

  const existingSlot = (fromUser.partnerLinks || []).find((l) => l.slot === slot);
  if (existingSlot?.partnerId) {
    throw new Error('Ce slot est déjà utilisé (invitation en attente ou partenaire confirmé)');
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

  // Clear sender slot if it matches this invite
  const sender = await User.findById(invite.fromUser);
  if (sender) {
    sender.partnerLinks = (sender.partnerLinks || []).filter((l) => {
      if (l.slot !== invite.slot) return true;
      if (!l.partnerId) return true;
      return l.partnerId.toString() !== invite.toUser.toString();
    });
    await sender.save();
  }

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
