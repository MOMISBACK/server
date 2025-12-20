// server/services/challengeService.js

const mongoose = require('mongoose');
const WeeklyChallenge = require('../models/WeeklyChallenge');
const Activity = require('../models/Activity');
const User = require('../models/User');

class ChallengeService {
  
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

    // ✅ NEW: Vérifier que l'utilisateur n'a pas déjà un challenge actif
    const existingActive = await WeeklyChallenge.findOne({
      'players.user': userId,
      status: 'active',
      endDate: { $gt: new Date() }
    });

    if (existingActive) {
      throw new Error('Vous avez déjà un challenge actif');
    }

    const { startDate, endDate } = this._calculateWeekDates();

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
      user: userId // Rétro-compatibilité
    });

    await challenge.save();
    console.log('✅ Challenge SOLO créé:', challenge._id);
    return challenge;
  }

  // ⭐ AMÉLIORÉ : Créer un challenge DUO (avec invitation)
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

    // ✅ AMÉLIORÉ : Vérifier que le partenaire existe et est actif
    const partner = await User.findById(partnerId).select('email isActive isBanned');
    if (!partner) {
      throw new Error('Partenaire introuvable');
    }

    // ✅ NEW: Vérifier statut du partenaire
    if (partner.isBanned) {
      throw new Error('Ce partenaire ne peut pas participer aux challenges');
    }

    if (partner.isActive === false) {
      throw new Error('Ce partenaire n\'est pas actif');
    }

    // ✅ Vérifier que le créateur n'a pas déjà une invitation pending
    const existingPending = await WeeklyChallenge.findOne({
      creator: creatorId,
      mode: 'duo',
      status: 'pending',
      invitationStatus: 'pending',
      endDate: { $gt: new Date() }
    });

    if (existingPending) {
      throw new Error('Vous avez déjà une invitation en attente. Veuillez attendre la réponse.');
    }

    // ✅ NEW: Vérifier que le créateur n'a pas déjà un challenge actif
    const creatorActiveChallenge = await WeeklyChallenge.findOne({
      'players.user': creatorId,
      status: 'active',
      endDate: { $gt: new Date() }
    });

    if (creatorActiveChallenge) {
      throw new Error('Vous avez déjà un challenge en cours');
    }

    // ✅ NEW: Vérifier que le partenaire n'a pas déjà un challenge actif/pending
    const partnerActiveChallenge = await WeeklyChallenge.findOne({
      'players.user': partnerId,
      status: { $in: ['active', 'pending'] },
      endDate: { $gt: new Date() }
    });

    if (partnerActiveChallenge) {
      throw new Error('Ce partenaire a déjà un challenge en cours ou une invitation en attente');
    }

    const { startDate, endDate } = this._calculateWeekDates();

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
      startDate,
      endDate,
      status: 'pending',
      invitationStatus: 'pending'
    });

    await challenge.save();
    console.log('✅ Challenge DUO créé (invitation envoyée):', {
      id: challenge._id,
      creator: creatorId,
      partner: partnerId
    });
    
    return challenge;
  }

  // ⭐ AMÉLIORÉ : Accepter une invitation DUO (avec transaction)
  async acceptInvitation(userId, challengeId) {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      console.log('🔄 Acceptation invitation:', { userId, challengeId });

      // ✅ Trouver le challenge avec lock
      const challenge = await WeeklyChallenge.findById(challengeId).session(session);
      
      if (!challenge) {
        throw new Error('Challenge introuvable');
      }

      if (challenge.mode !== 'duo') {
        throw new Error('Ce challenge n\'est pas en mode duo');
      }

      // ✅ Vérifier que le challenge est en attente
      if (challenge.status !== 'pending' || challenge.invitationStatus !== 'pending') {
        throw new Error('Cette invitation n\'est plus disponible');
      }

      // ✅ Vérifier que l'utilisateur est invité
      const isPlayer = challenge.players.some(p => p.user.toString() === userId.toString());
      if (!isPlayer) {
        throw new Error('Vous n\'êtes pas invité à ce challenge');
      }

      // ✅ Vérifier que ce n'est pas le créateur
      if (challenge.creator.toString() === userId.toString()) {
        throw new Error('Vous ne pouvez pas accepter votre propre invitation');
      }

      // ✅ Vérifier que l'utilisateur n'a pas déjà un challenge actif (AVEC LOCK)
      const userActiveChallenge = await WeeklyChallenge.findOne({
        'players.user': userId,
        status: { $in: ['active', 'pending'] },
        endDate: { $gt: new Date() },
        _id: { $ne: challengeId } // Exclure le challenge en cours d'acceptation
      }).session(session);

      if (userActiveChallenge) {
        throw new Error('Vous avez déjà un challenge en cours');
      }

      // ✅ Mettre à jour le challenge
      challenge.status = 'active';
      challenge.invitationStatus = 'accepted';
      await challenge.save({ session });

      // ✅ Commit transaction
      await session.commitTransaction();
      
      console.log('✅ Invitation acceptée avec succès:', challengeId);
      return challenge;

    } catch (error) {
      // ✅ Rollback en cas d'erreur
      await session.abortTransaction();
      console.error('❌ Erreur acceptation invitation:', error.message);
      throw error;
      
    } finally {
      session.endSession();
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

    // ✅ Vérifier que le challenge est encore pending
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

    challenge.status = 'cancelled';
    challenge.invitationStatus = 'refused';
    await challenge.save();

    console.log('❌ Invitation refusée:', challengeId);
    return challenge;
  }

  // ⭐ Calculer la progression d'un challenge
  async calculateProgress(userId) {
    const challenge = await WeeklyChallenge.findOne({
      'players.user': userId,
      status: { $in: ['active', 'pending', 'completed'] },
      endDate: { $gt: new Date() }
    })
    .populate('players.user', 'email totalDiamonds')
    .sort({ createdAt: -1 });

    if (!challenge) return null;

    console.log('📊 Calcul progression challenge:', {
      id: challenge._id,
      mode: challenge.mode,
      status: challenge.status
    });

    for (let i = 0; i < challenge.players.length; i++) {
      const player = challenge.players[i];
      const playerId = typeof player.user === 'string' ? player.user : player.user._id;
      
      const activities = await Activity.find({
        user: playerId,
        date: {
          $gte: challenge.startDate,
          $lt: challenge.endDate
        },
        type: { $in: challenge.activityTypes }
      });

      console.log(`📊 Joueur ${i + 1}:`, {
        userId: playerId,
        activitiesTrouvees: activities.length
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
      challenge.players[i].completed = completed;

      console.log(`✅ Progression joueur ${i + 1}:`, {
        progress: current,
        diamonds,
        completed,
        pourcentage: Math.round((current / challenge.goal.value) * 100)
      });
    }

    // ✅ Vérifier et attribuer le bonus DUO
    if (challenge.mode === 'duo' && !challenge.bonusAwarded) {
      if (challenge.checkBonus()) {
        console.log('🎉 Conditions bonus remplies !');
        await challenge.awardBonus();
      }
    }

    await challenge.save();
    return challenge;
  }

  // ⭐ Récupérer le challenge actif d'un utilisateur
  async getCurrentChallenge(userId) {
    const challenge = await WeeklyChallenge.findOne({
      'players.user': userId,
      status: { $in: ['active', 'pending', 'completed'] },
      endDate: { $gt: new Date() }
    })
    .populate('players.user', 'email totalDiamonds')
    .sort({ createdAt: -1 });

    if (challenge) {
      return await this.calculateProgress(userId);
    }

    return null;
  }

  // ⭐ Récupérer les invitations en attente d'un utilisateur
  async getPendingInvitations(userId) {
    const invitations = await WeeklyChallenge.find({
      'players.user': userId,
      creator: { $ne: userId },
      status: 'pending',
      invitationStatus: 'pending',
      endDate: { $gt: new Date() }
    })
    .populate('creator', 'email')
    .populate('players.user', 'email')
    .sort({ createdAt: -1 });

    console.log(`📬 ${invitations.length} invitation(s) trouvée(s) pour user ${userId}`);
    return invitations;
  }

  // ⭐ Mettre à jour un challenge
  async updateChallenge(userId, data) {
    const challenge = await WeeklyChallenge.findOne({
      creator: userId,
      status: { $in: ['active', 'pending'] },
      endDate: { $gt: new Date() }
    });

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

    // Réinitialiser la progression
    challenge.players.forEach(player => {
      player.progress = 0;
      player.diamonds = 0;
      player.completed = false;
    });

    await challenge.save();
    console.log('✅ Challenge mis à jour:', challenge._id);
    
    return await this.calculateProgress(userId);
  }

  // ⭐ AMÉLIORÉ : Supprimer/Quitter un challenge
  async deleteChallenge(userId) {
    const challenge = await WeeklyChallenge.findOne({
      'players.user': userId,
      status: { $in: ['active', 'pending', 'completed'] },
      endDate: { $gt: new Date() }
    });

    if (!challenge) {
      throw new Error('Aucun challenge actif');
    }

    console.log('🗑️ Suppression challenge:', {
      id: challenge._id,
      mode: challenge.mode,
      status: challenge.status
    });

    // ✅ Finaliser avant de supprimer (attribuer les diamants)
    if (challenge.status !== 'completed') {
      console.log('💎 Finalisation avant suppression...');
      await this.finalizeChallenge(challenge._id);
    }

    await WeeklyChallenge.findByIdAndDelete(challenge._id);

    console.log('✅ Challenge quitté et supprimé');
    return { success: true, message: 'Challenge supprimé avec succès' };
  }

  // ✅ AMÉLIORÉ : Clôturer un challenge et attribuer les diamants
  async finalizeChallenge(challengeId) {
    const challenge = await WeeklyChallenge.findById(challengeId);
    
    if (!challenge) {
      throw new Error('Challenge introuvable');
    }
    
    if (challenge.status === 'completed' && challenge.bonusAwarded) {
      console.log('⚠️ Challenge déjà finalisé et bonus attribué');
      return challenge;
    }
    
    console.log('🏁 Clôture du challenge:', challengeId);
    
    // ✅ Attribuer les diamants normaux à chaque joueur
    for (const player of challenge.players) {
      const playerId = typeof player.user === 'string' ? player.user : player.user._id;
      
      if (player.diamonds > 0) {
        const result = await User.findByIdAndUpdate(
          playerId,
          { $inc: { totalDiamonds: player.diamonds } },
          { new: true }
        );
        
        if (result) {
          console.log(`💎 +${player.diamonds} diamants → ${playerId} (Total: ${result.totalDiamonds})`);
        }
      }
    }
    
    // ✅ Si DUO et bonus débloqué
    if (challenge.mode === 'duo' && !challenge.bonusAwarded) {
      if (challenge.checkBonus()) {
        console.log('🎁 Attribution du BONUS DUO (doublement)...');
        
        // Doubler les diamants (bonus)
        for (const player of challenge.players) {
          const playerId = typeof player.user === 'string' ? player.user : player.user._id;
          
          const result = await User.findByIdAndUpdate(
            playerId,
            { $inc: { totalDiamonds: player.diamonds } },
            { new: true }
          );
          
          if (result) {
            console.log(`🎁 BONUS +${player.diamonds} diamants → ${playerId} (Total: ${result.totalDiamonds})`);
          }
        }
        
        challenge.bonusEarned = true;
        challenge.bonusAwarded = true;
      } else {
        console.log('⚠️ Bonus DUO non débloqué (tous les joueurs doivent compléter)');
      }
    }
    
    challenge.status = 'completed';
    await challenge.save();
    
    console.log(`✅ Challenge ${challenge._id} finalisé`);
    return challenge;
  }

  // ⭐ Helper : calculer les dates de la semaine
  _calculateWeekDates() {
    const now = new Date();
    const dayOfWeek = now.getDay();
    
    let daysFromMonday;
    if (dayOfWeek === 0) {
      daysFromMonday = 6; // Dimanche
    } else {
      daysFromMonday = dayOfWeek - 1; // Lundi = 0
    }
    
    const thisMonday = new Date(now);
    thisMonday.setDate(now.getDate() - daysFromMonday);
    thisMonday.setHours(0, 0, 0, 0);
    
    const nextMonday = new Date(thisMonday);
    nextMonday.setDate(thisMonday.getDate() + 7);
    nextMonday.setHours(23, 59, 59, 999);

    return { startDate: thisMonday, endDate: nextMonday };
  }
}

module.exports = new ChallengeService();