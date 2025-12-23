// server/services/challengeService.js

const mongoose = require('mongoose');
const WeeklyChallenge = require('../models/WeeklyChallenge');
const Activity = require('../models/Activity');
const User = require('../models/User');
const DiamondTransaction = require('../models/DiamondTransaction');

class ChallengeService {

  STAKE_PER_PLAYER = 10;
  STAKE_PAYOUT_MULTIPLIER = 4;

  _log(...args) {
    if (process.env.NODE_ENV === 'test') return;
    console.log(...args);
  }

  async _recordDiamondTx({ userId, amount, kind, refId, note }) {
    try {
      await DiamondTransaction.create({
        user: userId,
        amount,
        kind,
        refId,
        note,
      });
    } catch (_) {
      // Non-blocking: never fail the main flow because of auditing.
    }
  }

  async _debitDiamondsOrThrow(userId, amount, meta = {}) {
    if (!amount || amount <= 0) return;

    const res = await User.updateOne(
      { _id: userId, totalDiamonds: { $gte: amount } },
      { $inc: { totalDiamonds: -amount } }
    );

    if (!res || res.modifiedCount !== 1) {
      throw new Error('Diamants insuffisants');
    }

    await this._recordDiamondTx({
      userId,
      amount: -amount,
      kind: meta.kind || 'other',
      refId: meta.refId,
      note: meta.note,
    });
  }

  async _creditDiamonds(userId, amount, meta = {}) {
    if (!amount || amount <= 0) return;
    await User.updateOne({ _id: userId }, { $inc: { totalDiamonds: amount } });
    await this._recordDiamondTx({
      userId,
      amount,
      kind: meta.kind || 'other',
      refId: meta.refId,
      note: meta.note,
    });
  }

  _getStakeEntry(challenge, userId) {
    const stakes = Array.isArray(challenge?.stakes) ? challenge.stakes : [];
    return stakes.find((s) => s?.user?.toString?.() === userId.toString());
  }

  async _holdStakeOrThrow(challenge, userId, amount) {
    const existing = this._getStakeEntry(challenge, userId);
    if (existing && existing.status === 'held') return;

    await this._debitDiamondsOrThrow(userId, amount, {
      kind: 'stake_hold',
      refId: challenge?._id,
      note: 'Mise en jeu',
    });

    const stakes = Array.isArray(challenge.stakes) ? challenge.stakes : [];
    const next = stakes.filter((s) => s?.user?.toString?.() !== userId.toString());
    next.push({ user: userId, amount, status: 'held', updatedAt: new Date() });
    challenge.stakes = next;
    challenge.stakePerPlayer = amount;
  }

  async _refundStakeIfHeld(challenge, userId) {
    const entry = this._getStakeEntry(challenge, userId);
    if (!entry || entry.status !== 'held') return;

    await this._creditDiamonds(userId, entry.amount, {
      kind: 'stake_refund',
      refId: challenge?._id,
      note: 'Remboursement de mise',
    });

    entry.status = 'refunded';
    entry.updatedAt = new Date();
  }

  _burnStakeIfHeld(challenge, userId) {
    const entry = this._getStakeEntry(challenge, userId);
    if (!entry || entry.status !== 'held') return;
    entry.status = 'burned';
    entry.updatedAt = new Date();
  }

  async _payoutStakeIfHeld(challenge, userId, multiplier) {
    const entry = this._getStakeEntry(challenge, userId);
    if (!entry || entry.status !== 'held') return;

    const payout = entry.amount * multiplier;
    await this._creditDiamonds(userId, payout, {
      kind: 'stake_payout',
      refId: challenge?._id,
      note: `Gain pacte x${multiplier}`,
    });

    entry.status = 'paid';
    entry.updatedAt = new Date();
  }

  _isExpired(challenge) {
    if (!challenge?.endDate) return false;
    return new Date() > new Date(challenge.endDate);
  }

  _isSuccess(challenge) {
    if (!challenge || !challenge.endDate) return false;
    const end = new Date(challenge.endDate);

    if (challenge.mode === 'solo') {
      const p = Array.isArray(challenge.players) ? challenge.players[0] : null;
      if (!p?.completed || !p?.completedAt) return false;
      return new Date(p.completedAt) <= end;
    }

    if (challenge.mode === 'duo') {
      const players = Array.isArray(challenge.players) ? challenge.players : [];
      if (players.length !== 2) return false;
      return players.every((p) => p?.completed && p?.completedAt && new Date(p.completedAt) <= end);
    }

    return false;
  }

  async _settleChallengeIfNeeded(challenge, reasonHint) {
    if (!challenge) return challenge;
    if (challenge.settlement?.status && challenge.settlement.status !== 'none') return challenge;

    const isExpired = this._isExpired(challenge);
    const isSuccess = this._isSuccess(challenge);

    if (isSuccess) {
      const multiplier = this.STAKE_PAYOUT_MULTIPLIER;
      for (const player of challenge.players || []) {
        const playerId = typeof player.user === 'string' ? player.user : player.user._id;
        await this._payoutStakeIfHeld(challenge, playerId, multiplier);
      }
      challenge.settlement = { status: 'success', reason: 'completed', settledAt: new Date() };
      challenge.status = 'completed';
      await challenge.save();
      return challenge;
    }

    if (isExpired) {
      for (const player of challenge.players || []) {
        const playerId = typeof player.user === 'string' ? player.user : player.user._id;
        this._burnStakeIfHeld(challenge, playerId);
        await this._recordDiamondTx({
          userId: playerId,
          amount: 0,
          kind: 'stake_burn',
          refId: challenge?._id,
          note: 'Mise perdue (pacte expiré)',
        });
      }
      challenge.settlement = { status: 'loss', reason: 'expired', settledAt: new Date() };
      challenge.status = 'failed';
      await challenge.save();
      return challenge;
    }

    if (reasonHint === 'cancelled') {
      // handled elsewhere
      return challenge;
    }

    return challenge;
  }

  async _getConfirmedPartnerIdForSlot(userId, slot) {
    if (slot !== 'p1' && slot !== 'p2') return null;
    const user = await User.findById(userId).select('partnerLinks');
    if (!user) return null;
    const link = Array.isArray(user.partnerLinks)
      ? user.partnerLinks.find(l => l?.slot === slot && l?.status === 'confirmed' && l?.partnerId)
      : null;
    return link?.partnerId ? link.partnerId.toString() : null;
  }

  _duoPairQuery(userId, partnerId) {
    return {
      mode: 'duo',
      'players.user': { $all: [userId, partnerId] },
    };
  }

  async _findCurrentChallengeDoc(userId, options = {}) {
    const slot = options?.slot;
    const now = new Date();

    if (slot === 'solo') {
      return WeeklyChallenge.findOne({
        mode: 'solo',
        'players.user': userId,
        status: { $in: ['active', 'completed'] },
        endDate: { $gt: now }
      })
        .populate('players.user', 'username email totalDiamonds')
        .sort({ createdAt: -1 });
    }

    if (slot === 'p1' || slot === 'p2') {
      const partnerId = await this._getConfirmedPartnerIdForSlot(userId, slot);
      if (!partnerId) return null;

      return WeeklyChallenge.findOne({
        ...this._duoPairQuery(userId, partnerId),
        status: { $in: ['active', 'completed'] },
        endDate: { $gt: now }
      })
        .populate('players.user', 'username email totalDiamonds')
        .sort({ createdAt: -1 });
    }

    // Backward-compatible behavior: latest active/completed challenge regardless of slot.
    return WeeklyChallenge.findOne({
      'players.user': userId,
      status: { $in: ['active', 'completed'] },
      endDate: { $gt: now }
    })
      .populate('players.user', 'username email totalDiamonds')
      .sort({ createdAt: -1 });
  }
  
  // ⭐ Créer un challenge SOLO
  async createSoloChallenge(userId, data) {
    const { goal, activityTypes, title, icon } = data;

    // ✅ Validation
    if (!goal || !goal.type || !goal.value) {
      throw new Error('Un objectif valide est requis');
    }

    if (!activityTypes || activityTypes.length === 0) {
      throw new Error('Au moins un type d\'activité est requis');
    }

    if (goal.value <= 0) {
      throw new Error('La valeur de l\'objectif doit être positive');
    }

    // ✅ Vérifier que l'utilisateur n'a pas déjà un challenge SOLO actif
    const existingActive = await WeeklyChallenge.findOne({
      'players.user': userId,
      mode: 'solo',
      status: 'active',
      endDate: { $gt: new Date() }
    });

    if (existingActive) {
      throw new Error('Vous avez déjà un challenge actif');
    }

    let staked = false;
    try {
      // Mise en jeu SOLO
      await this._debitDiamondsOrThrow(userId, this.STAKE_PER_PLAYER, {
        kind: 'stake_hold',
        note: 'Mise pacte SOLO',
      });
      staked = true;

      // ✅ CHANGÉ: Utiliser 7 jours à partir de maintenant (pas la semaine calendaire)
      const { startDate, endDate } = this._calculate7DayChallengeDates();

      const challenge = new WeeklyChallenge({
        mode: 'solo',
        creator: userId,
        players: [{
          user: userId,
          progress: 0,
          diamonds: 0,
          completed: false
        }],
        goal,
        activityTypes,
        title: title || 'Challenge SOLO',
        icon: icon || 'trophy-outline',
        startDate,
        endDate,
        status: 'active',
        stakePerPlayer: this.STAKE_PER_PLAYER,
        stakes: [{ user: userId, amount: this.STAKE_PER_PLAYER, status: 'held', updatedAt: new Date() }],
        settlement: { status: 'none', reason: null, settledAt: null },
        user: userId // Rétro-compatibilité
      });

      await challenge.save();

      this._log('✅ Challenge SOLO créé (7 jours):', challenge._id);
      return challenge;
    } catch (error) {
      if (staked) {
        await this._creditDiamonds(userId, this.STAKE_PER_PLAYER, {
          kind: 'stake_refund',
          note: 'Remboursement mise (erreur création SOLO)',
        });
      }
      throw error;
    }
  }

  // ⭐ Créer un challenge DUO (avec invitation)
  async createDuoChallenge(creatorId, partnerId, data) {
    const { goal, activityTypes, title, icon } = data;

    // ✅ Validation basique
    if (!goal || !goal.type || !goal.value) {
      throw new Error('Un objectif valide est requis');
    }

    if (!activityTypes || activityTypes.length === 0) {
      throw new Error('Au moins un type d\'activité est requis');
    }

    if (goal.value <= 0) {
      throw new Error('La valeur de l\'objectif doit être positive');
    }

    if (!partnerId) {
      throw new Error('L\'ID du partenaire est requis');
    }

    if (creatorId === partnerId || creatorId.toString() === partnerId.toString()) {
      throw new Error('Vous ne pouvez pas vous inviter vous-même');
    }

    // ✅ Vérifier que le partenaire existe et est actif
    const partner = await User.findById(partnerId).select('email isActive isBanned');
    if (!partner) {
      throw new Error('Partenaire introuvable');
    }

    if (partner.isBanned) {
      throw new Error('Ce partenaire ne peut pas participer aux challenges');
    }

    if (partner.isActive === false) {
      throw new Error('Ce partenaire n\'est pas actif');
    }

    // ✅ Vérifier que le créateur n'a pas déjà une invitation pending avec ce partenaire
    const existingPending = await WeeklyChallenge.findOne({
      creator: creatorId,
      mode: 'duo',
      'players.user': { $all: [creatorId, partnerId] },
      status: 'pending',
      invitationStatus: 'pending',
    });

    if (existingPending) {
      throw new Error('Vous avez déjà une invitation en attente. Veuillez attendre la réponse.');
    }

    // ✅ Vérifier que le créateur n'a pas déjà un challenge DUO actif avec ce partenaire
    const creatorActiveChallenge = await WeeklyChallenge.findOne({
      mode: 'duo',
      'players.user': { $all: [creatorId, partnerId] },
      status: 'active',
      endDate: { $gt: new Date() }
    });

    if (creatorActiveChallenge) {
      throw new Error('Vous avez déjà un challenge en cours');
    }

    // ✅ Vérifier que le partenaire n'a pas déjà un challenge DUO actif/pending avec ce créateur
    const partnerActiveChallenge = await WeeklyChallenge.findOne({
      mode: 'duo',
      'players.user': { $all: [creatorId, partnerId] },
      $or: [
        { status: 'pending', invitationStatus: 'pending' },
        { status: 'active', endDate: { $gt: new Date() } },
      ],
    });

    if (partnerActiveChallenge) {
      throw new Error('Ce partenaire a déjà un challenge en cours ou une invitation en attente');
    }

    let staked = false;
    try {
      // Mise en jeu DUO (créateur), remboursée si l'invitation est refusée
      await this._debitDiamondsOrThrow(creatorId, this.STAKE_PER_PLAYER, {
        kind: 'stake_hold',
        note: 'Mise invitation pacte DUO',
      });
      staked = true;

      // ✅ CHANGÉ: Ne pas setter les dates à la création (pending)
      // Les dates seront settées quand le challenge sera accepté
      const challenge = new WeeklyChallenge({
        mode: 'duo',
        creator: creatorId,
        players: [
          { user: creatorId, progress: 0, diamonds: 0, completed: false },
          { user: partnerId, progress: 0, diamonds: 0, completed: false }
        ],
        goal,
        activityTypes,
        title: title || 'Challenge DUO',
        icon: icon || 'people-outline',
        startDate: null,
        endDate: null,
        status: 'pending',
        invitationStatus: 'pending'
        ,stakePerPlayer: this.STAKE_PER_PLAYER
        ,stakes: [{ user: creatorId, amount: this.STAKE_PER_PLAYER, status: 'held', updatedAt: new Date() }]
        ,settlement: { status: 'none', reason: null, settledAt: null }
      });

      await challenge.save();

      this._log('✅ Challenge DUO créé (invitation en attente):', {
        id: challenge._id,
        creator: creatorId,
        partner: partnerId
      });

      return challenge;
    } catch (error) {
      if (staked) {
        await this._creditDiamonds(creatorId, this.STAKE_PER_PLAYER, {
          kind: 'stake_refund',
          note: 'Remboursement mise (erreur invitation DUO)',
        });
      }
      throw error;
    }
  }

  // ⭐ Accepter une invitation DUO
  async acceptInvitation(userId, challengeId) {
    let staked = false;
    try {
      this._log('🔄 Acceptation invitation:', { userId, challengeId });

      const challenge = await WeeklyChallenge.findById(challengeId);
      
      if (!challenge) {
        throw new Error('Challenge introuvable');
      }

      if (challenge.mode !== 'duo') {
        throw new Error('Ce challenge n\'est pas en mode duo');
      }

      if (challenge.status !== 'pending' || challenge.invitationStatus !== 'pending') {
        throw new Error('Cette invitation n\'est plus disponible');
      }

      const isPlayer = challenge.players.some(p => p.user.toString() === userId.toString());
      if (!isPlayer) {
        throw new Error('Vous n\'êtes pas invité à ce challenge');
      }

      if (challenge.creator.toString() === userId.toString()) {
        throw new Error('Vous ne pouvez pas accepter votre propre invitation');
      }

      // Only prevent accepting if there is already another DUO involving the same pair.
      const userActiveChallenge = await WeeklyChallenge.findOne({
        mode: 'duo',
        'players.user': { $all: [userId, challenge.creator] },
        $or: [
          { status: 'pending', invitationStatus: 'pending' },
          { status: 'active', endDate: { $gt: new Date() } },
        ],
        _id: { $ne: challengeId }
      });

      if (userActiveChallenge) {
        throw new Error('Vous avez déjà un challenge en cours');
      }

      // Mise en jeu de l'invité au moment d'accepter
      await this._debitDiamondsOrThrow(userId, this.STAKE_PER_PLAYER, {
        kind: 'stake_hold',
        refId: challengeId,
        note: 'Mise acceptation pacte DUO',
      });
      staked = true;

      // ✅ CHANGÉ: Setter les dates quand le challenge est accepté (7 jours à partir de maintenant)
      const { startDate, endDate } = this._calculate7DayChallengeDates();

      const res = await WeeklyChallenge.updateOne(
        {
          _id: challengeId,
          mode: 'duo',
          status: 'pending',
          invitationStatus: 'pending',
          creator: challenge.creator,
          'players.user': { $all: [userId, challenge.creator] },
        },
        {
          $set: {
            startDate,
            endDate,
            status: 'active',
            invitationStatus: 'accepted',
          },
          $push: {
            stakes: { user: userId, amount: this.STAKE_PER_PLAYER, status: 'held', updatedAt: new Date() },
          },
        }
      );

      if (!res || res.modifiedCount !== 1) {
        throw new Error('Cette invitation n\'est plus disponible');
      }

      const updated = await WeeklyChallenge.findById(challengeId);
      if (!updated) {
        throw new Error('Challenge introuvable');
      }
      
      this._log('✅ Invitation acceptée avec succès (7 jours):', challengeId);
      return updated;

    } catch (error) {
      if (staked) {
        await this._creditDiamonds(userId, this.STAKE_PER_PLAYER, {
          kind: 'stake_refund',
          refId: challengeId,
          note: 'Remboursement mise (échec acceptation DUO)',
        });
      }
      if (process.env.NODE_ENV !== 'test') {
        console.error('❌ Erreur acceptation invitation:', error.message);
      }
      throw error;
    }
  }

  // ⭐ Refuser une invitation DUO
  async refuseInvitation(userId, challengeId) {
    const challenge = await WeeklyChallenge.findById(challengeId);
    
    if (!challenge) {
      throw new Error('Challenge introuvable');
    }

    if (challenge.mode !== 'duo') {
      throw new Error('Ce challenge n\'est pas en mode duo');
    }

    if (challenge.status !== 'pending' || challenge.invitationStatus !== 'pending') {
      throw new Error('Cette invitation n\'est plus disponible');
    }

    const isPlayer = challenge.players.some(p => p.user.toString() === userId.toString());
    if (!isPlayer) {
      throw new Error('Vous n\'êtes pas invité à ce challenge');
    }

    if (challenge.creator.toString() === userId.toString()) {
      throw new Error('Vous ne pouvez pas refuser votre propre challenge');
    }

    // Refus: personne ne perd, le créateur récupère sa mise.
    await this._refundStakeIfHeld(challenge, challenge.creator);
    challenge.status = 'cancelled';
    challenge.invitationStatus = 'refused';
    challenge.settlement = { status: 'cancelled', reason: 'refused', settledAt: new Date() };
    await challenge.save();

    this._log('❌ Invitation refusée:', challengeId);
    return challenge;
  }

  // ⭐ CORRIGÉ : Calculer la progression d'un challenge
  async calculateProgress(userId, options = {}) {
    this._log('🔍 calculateProgress appelé pour user:', userId);

    // Slot-aware: when slot is provided, only compute that slot's challenge.
    // Pending invitations are handled via /invitations and are not returned here.
    const challenge = await this._findCurrentChallengeDoc(userId, options);

    if (!challenge) {
      this._log('❌ Aucun challenge trouvé pour calculateProgress');
      return null;
    }

    this._log('📊 Calcul progression challenge:', {
      id: challenge._id,
      mode: challenge.mode,
      status: challenge.status,
      creatorId: challenge.creator
    });

    const now = new Date();

    for (let i = 0; i < challenge.players.length; i++) {
      const player = challenge.players[i];
      const playerId = typeof player.user === 'string' ? player.user : player.user._id;
      
      // ✅ Normaliser les dates : startDate à 00:00:00 et endDate à 23:59:59.999
      const startDateNormalized = new Date(challenge.startDate);
      startDateNormalized.setHours(0, 0, 0, 0);
      
      const endDateNormalized = new Date(challenge.endDate);
      endDateNormalized.setHours(23, 59, 59, 999);

      const createdAtDate = challenge.createdAt ? new Date(challenge.createdAt) : startDateNormalized;
      const lowerBound = startDateNormalized > createdAtDate ? startDateNormalized : createdAtDate;
      
      // Construire la requête d'activités
      const activityQuery = {
        user: playerId,
        date: {
          $gte: startDateNormalized,
          $lte: endDateNormalized
        },
        createdAt: { $gte: lowerBound },
        type: { $in: challenge.activityTypes }
      };

      const activities = await Activity.find(activityQuery);

      this._log(`📋 Activités trouvées pour ${playerId}:`, {
        count: activities.length,
        startDate: startDateNormalized.toISOString(),
        endDate: endDateNormalized.toISOString(),
        createdAfter: challenge.status === 'pending' && challenge.createdAt ? new Date(challenge.createdAt).toISOString() : null,
        activityTypes: challenge.activityTypes,
        activities: activities.map(a => ({
          date: new Date(a.date).toISOString(),
          type: a.type,
          distance: a.distance,
          duration: a.duration,
          createdAt: a.createdAt ? new Date(a.createdAt).toISOString() : null
        }))
      });

      let current = 0;

      switch (challenge.goal.type) {
        case 'distance':
          current = activities.reduce((sum, a) => sum + (a.distance || 0), 0);
          break;
        case 'duration':
          current = activities.reduce((sum, a) => sum + (a.duration || 0), 0);
          break;
        case 'count':
          current = activities.length;
          break;
      }

      const diamonds = Math.min(
        Math.floor((current / challenge.goal.value) * 4),
        4
      );
      const completed = current >= challenge.goal.value;

      challenge.players[i].progress = current;
      challenge.players[i].diamonds = diamonds;
      const wasCompleted = Boolean(challenge.players[i].completed);
      challenge.players[i].completed = completed;
      if (!wasCompleted && completed) {
        challenge.players[i].completedAt = now;
      }
    }

    await challenge.save();
    // Stake settlement rules:
    // - SOLO: completed before end => payout x4, else (at expiry) loss
    // - DUO: both completed before end => payout x4 to both, else (at expiry) loss
    return await this._settleChallengeIfNeeded(challenge);
  }

  // ⭐ CORRIGÉ : Récupérer le challenge actif d'un utilisateur
  async getCurrentChallenge(userId) {
    this._log('🔍 getCurrentChallenge appelé pour user:', userId);
    // Backward-compatible: return latest computed challenge
    const challenge = await this.calculateProgress(userId);
    if (challenge) {
      this._log(`✅ Challenge trouvé: ${challenge._id}`);
      return challenge;
    }

    this._log('❌ Aucun challenge trouvé pour cet utilisateur');
    return null;
  }

  // ⭐ Récupérer les invitations en attente d'un utilisateur
  async getPendingInvitations(userId) {
    const invitations = await WeeklyChallenge.find({
      'players.user': userId,
      creator: { $ne: userId },
      status: 'pending',
      invitationStatus: 'pending'
    })
    .populate('creator', 'username email')
    .populate('players.user', 'username email')
    .sort({ createdAt: -1 });

    this._log(`📬 ${invitations.length} invitation(s) trouvée(s) pour user ${userId}`);
    return invitations;
  }

  // ⭐ Récupérer l'invitation envoyée (pending) par le créateur
  async getPendingSentChallenge(userId, options = {}) {
    const slot = options?.slot;

    let query = {
      creator: userId,
      mode: 'duo',
      status: 'pending',
      invitationStatus: 'pending',
    };

    if (slot === 'p1' || slot === 'p2') {
      const partnerId = await this._getConfirmedPartnerIdForSlot(userId, slot);
      if (!partnerId) return null;
      query = { ...query, ...this._duoPairQuery(userId, partnerId) };
    } else if (slot === 'solo') {
      return null;
    }

    const challenge = await WeeklyChallenge.findOne(query)
      .populate('creator', 'username email')
      .populate('players.user', 'username email totalDiamonds')
      .sort({ createdAt: -1 });

    return challenge || null;
  }

  // ⭐ Mettre à jour un challenge
  async updateChallenge(userId, data, options = {}) {
    const slot = options?.slot;
    const now = new Date();

    let query = {
      creator: userId,
      $or: [
        { status: 'pending', invitationStatus: 'pending' },
        { status: 'active', endDate: { $gt: now } },
      ],
    };

    if (slot === 'solo') {
      query = { ...query, mode: 'solo' };
    } else if (slot === 'p1' || slot === 'p2') {
      const partnerId = await this._getConfirmedPartnerIdForSlot(userId, slot);
      if (!partnerId) throw new Error('Aucun partenaire actif pour ce slot');
      query = { ...query, ...this._duoPairQuery(userId, partnerId) };
    }

    const challenge = await WeeklyChallenge.findOne(query);

    if (!challenge) {
      throw new Error('Aucun challenge actif ou vous n\'êtes pas le créateur');
    }

    if (!data.goal || !data.goal.type || !data.goal.value) {
      throw new Error('Un objectif valide est requis');
    }

    if (!data.activityTypes || data.activityTypes.length === 0) {
      throw new Error('Au moins un type d\'activité est requis');
    }

    challenge.goal = data.goal;
    challenge.activityTypes = data.activityTypes;
    challenge.title = data.title || challenge.title;
    challenge.icon = data.icon || challenge.icon;

    challenge.players.forEach(player => {
      player.progress = 0;
      player.diamonds = 0;
      player.completed = false;
    });

    await challenge.save();
    this._log('✅ Challenge mis à jour:', challenge._id);
    
    return await this.calculateProgress(userId, options);
  }

  // ⭐ Supprimer/Quitter un challenge
  async deleteChallenge(userId, options = {}) {
    const slot = options?.slot;
    const now = new Date();

    let query = {
      'players.user': userId,
      $or: [
        { status: 'pending', invitationStatus: 'pending' },
        { status: 'active', endDate: { $gt: now } },
        { status: 'completed', endDate: { $gt: now } },
      ],
    };

    if (slot === 'solo') {
      query = { ...query, mode: 'solo' };
    } else if (slot === 'p1' || slot === 'p2') {
      const partnerId = await this._getConfirmedPartnerIdForSlot(userId, slot);
      if (!partnerId) throw new Error('Aucun partenaire actif pour ce slot');
      query = { ...query, ...this._duoPairQuery(userId, partnerId) };
    }

    const challenge = await WeeklyChallenge.findOne(query);

    if (!challenge) {
      throw new Error('Aucun challenge actif');
    }

    this._log('🗑️ Suppression challenge:', {
      id: challenge._id,
      mode: challenge.mode,
      status: challenge.status
    });

    // Pending DUO invitation cancelled by creator: refund stake (no penalty).
    if (
      challenge.mode === 'duo' &&
      challenge.status === 'pending' &&
      challenge.invitationStatus === 'pending' &&
      challenge.creator.toString() === userId.toString()
    ) {
      await this._refundStakeIfHeld(challenge, userId);
      challenge.status = 'cancelled';
      challenge.settlement = { status: 'cancelled', reason: 'cancelled', settledAt: new Date() };
      await challenge.save();
      await WeeklyChallenge.findByIdAndDelete(challenge._id);
      return { success: true, message: 'Invitation annulée' };
    }

    // Active cancellation: canceller loses stake, the other gets their stake back.
    if (challenge.status === 'active' || (challenge.mode === 'duo' && challenge.status === 'pending')) {
      const players = Array.isArray(challenge.players) ? challenge.players : [];
      for (const p of players) {
        const pid = typeof p.user === 'string' ? p.user : p.user._id;
        if (pid.toString() === userId.toString()) {
          this._burnStakeIfHeld(challenge, pid);
          await this._recordDiamondTx({
            userId: pid,
            amount: 0,
            kind: 'stake_burn',
            refId: challenge?._id,
            note: 'Mise perdue (annulation)',
          });
        } else {
          await this._refundStakeIfHeld(challenge, pid);
        }
      }
      challenge.status = 'cancelled';
      challenge.settlement = { status: 'cancelled', reason: 'cancelled', settledAt: new Date() };
      await challenge.save();
      await WeeklyChallenge.findByIdAndDelete(challenge._id);
      return { success: true, message: 'Challenge annulé' };
    }

    // Otherwise, settle before deletion (e.g., expired/completed).
    await this.finalizeChallenge(challenge._id);

    await WeeklyChallenge.findByIdAndDelete(challenge._id);

    this._log('✅ Challenge quitté et supprimé');
    return { success: true, message: 'Challenge supprimé avec succès' };
  }

  // ✅ Clôturer un challenge et attribuer les diamants
  async finalizeChallenge(challengeId) {
    const challenge = await WeeklyChallenge.findById(challengeId);
    
    if (!challenge) {
      throw new Error('Challenge introuvable');
    }
    
    this._log('🏁 Clôture du challenge (mise):', challengeId);
    return await this._settleChallengeIfNeeded(challenge);
  }

  // ⭐ Historique des challenges DUO (entre l'utilisateur et son partenaire de slot)
  async getDuoChallengeHistory(userId, options = {}) {
    const slot = options?.slot;
    const partnerIdFromQuery = options?.partnerId;

    let partnerId = null;
    if (partnerIdFromQuery) {
      partnerId = partnerIdFromQuery;
    } else {
      if (slot !== 'p1' && slot !== 'p2') {
        throw new Error('Slot invalide (p1/p2 requis)');
      }
      partnerId = await this._getConfirmedPartnerIdForSlot(userId, slot);
    }

    if (!partnerId) return [];

    const query = {
      ...this._duoPairQuery(userId, partnerId),
      status: { $in: ['active', 'completed'] },
    };

    const challenges = await WeeklyChallenge.find(query)
      .populate('creator', 'username email')
      .populate('players.user', 'username email totalDiamonds')
      .sort({ startDate: -1, createdAt: -1 });

    return Array.isArray(challenges) ? challenges : [];
  }

  // ⭐ Historique des challenges SOLO de l'utilisateur
  async getSoloChallengeHistory(userId) {
    const query = {
      mode: 'solo',
      'players.user': userId,
      status: { $in: ['active', 'completed'] },
    };

    const challenges = await WeeklyChallenge.find(query)
      .populate('creator', 'username email')
      .populate('players.user', 'username email totalDiamonds')
      .sort({ startDate: -1, createdAt: -1 });

    return Array.isArray(challenges) ? challenges : [];
  }

  // ⭐ Helper : calculer les dates de la semaine
  // ✅ NOUVEAU: Calculer 7 jours exactement à partir de maintenant
  // Utilisé quand un challenge est créé (SOLO) ou accepté (DUO)
  _calculate7DayChallengeDates() {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);
    
    // Le challenge se termine exactement 7 jours plus tard à 23:59:59.999
    const endDate = new Date(now);
    endDate.setDate(now.getDate() + 7);
    endDate.setHours(23, 59, 59, 999);

    this._log('📅 [_calculate7DayChallengeDates] Challenge 7 jours:', {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      durationDays: 7
    });

    return { startDate, endDate };
  }

  _calculateWeekDates() {
    const now = new Date();
    const dayOfWeek = now.getDay();
    
    // ✅ Le challenge commence AUJOURD'HUI
    const startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);
    
    // ✅ Le challenge se termine DIMANCHE MINUIT de cette semaine
    // dayOfWeek: 0=dimanche, 1=lundi, ..., 6=samedi
    let daysUntilSunday;
    if (dayOfWeek === 0) {
      // Si on est dimanche, se termine dimanche minuit (0 jours)
      daysUntilSunday = 0;
    } else {
      // Sinon, se termine le dimanche prochain
      daysUntilSunday = 7 - dayOfWeek;
    }
    
    const endDate = new Date(now);
    endDate.setDate(now.getDate() + daysUntilSunday);
    endDate.setHours(23, 59, 59, 999);

    this._log('📅 [_calculateWeekDates] Période:', {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      startDay: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][startDate.getDay()],
      endDay: 'dimanche'
    });

    return { startDate, endDate };
  }
}

module.exports = new ChallengeService();