// server/services/challengeService.js

const WeeklyChallenge = require('../models/WeeklyChallenge');
const Activity = require('../models/Activity');
const User = require('../models/User');

class ChallengeService {
  
  // ⭐ Créer un challenge SOLO
  async createSoloChallenge(userId, data) {
    const { goal, activityTypes, title, icon } = data;

    if (!goal || !goal.type || !goal.value) {
      throw new Error('Un objectif valide est requis');
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
      title,
      icon,
      startDate,
      endDate,
      status: 'active',
      user: userId
    });

    await challenge.save();
    console.log('✅ Challenge SOLO créé:', challenge._id);
    return challenge;
  }

  // ⭐ Créer un challenge DUO (avec invitation)
  async createDuoChallenge(creatorId, partnerId, data) {
    const { goal, activityTypes, title, icon } = data;

    if (!goal || !goal.type || !goal.value) {
      throw new Error('Un objectif valide est requis');
    }

    const partner = await User.findById(partnerId);
    if (!partner) {
      throw new Error('Partenaire introuvable');
    }

    if (creatorId === partnerId) {
      throw new Error('Vous ne pouvez pas vous inviter vous-même');
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
      title,
      icon,
      startDate,
      endDate,
      status: 'pending',
      invitationStatus: 'pending'
    });

    await challenge.save();
    console.log('✅ Challenge DUO créé (invitation envoyée):', challenge._id);
    return challenge;
  }

  // ⭐ Accepter une invitation DUO
  async acceptInvitation(userId, challengeId) {
    const challenge = await WeeklyChallenge.findById(challengeId);
    
    if (!challenge) {
      throw new Error('Challenge introuvable');
    }

    if (challenge.mode !== 'duo') {
      throw new Error('Ce challenge n\'est pas en mode duo');
    }

    const isPlayer = challenge.players.some(p => p.user.toString() === userId);
    if (!isPlayer) {
      throw new Error('Vous n\'êtes pas invité à ce challenge');
    }

    if (challenge.creator.toString() === userId) {
      throw new Error('Vous ne pouvez pas accepter votre propre invitation');
    }

    challenge.status = 'active';
    challenge.invitationStatus = 'accepted';
    await challenge.save();

    console.log('✅ Invitation acceptée:', challengeId);
    return challenge;
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

    const isPlayer = challenge.players.some(p => p.user.toString() === userId);
    if (!isPlayer) {
      throw new Error('Vous n\'êtes pas invité à ce challenge');
    }

    if (challenge.creator.toString() === userId) {
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
    // ✅ CORRIGÉ : Inclure 'completed'
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

    // Calculer pour chaque joueur
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

      // Calculer la progression selon le type d'objectif
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

      // ✅ Diamants proportionnels (max 4 par joueur)
      const diamonds = Math.min(
        Math.floor((current / challenge.goal.value) * 4),
        4
      );
      const completed = current >= challenge.goal.value;

      // Mise à jour du joueur
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

    // ✅ Vérifier et attribuer le bonus (DUO uniquement)
    if (challenge.mode === 'duo' && !challenge.bonusAwarded) {
      if (challenge.checkBonus()) {
        await challenge.awardBonus();
        console.log('🎉 BONUS DÉBLOQUÉ ! Diamants doublés');
      }
    }

    await challenge.save();
    return challenge;
  }

  // ⭐ Récupérer le challenge actif d'un utilisateur
  async getCurrentChallenge(userId) {
    // ✅ CORRIGÉ : Inclure 'completed'
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

    challenge.goal = data.goal;
    challenge.activityTypes = data.activityTypes;
    challenge.title = data.title;
    challenge.icon = data.icon;

    challenge.players.forEach(player => {
      player.progress = 0;
      player.diamonds = 0;
      player.completed = false;
    });

    await challenge.save();
    return await this.calculateProgress(userId);
  }

  // ⭐ Supprimer un challenge
  async deleteChallenge(userId) {
    const result = await WeeklyChallenge.findOneAndDelete({
      creator: userId,
      status: { $in: ['active', 'pending'] },
      endDate: { $gt: new Date() }
    });

    if (!result) {
      throw new Error('Aucun challenge actif ou vous n\'êtes pas le créateur');
    }

    return { success: true };
  }

  // ⭐ Helper : calculer les dates de la semaine
  _calculateWeekDates() {
    const now = new Date();
    const dayOfWeek = now.getDay();
    
    let daysFromMonday;
    if (dayOfWeek === 0) {
      daysFromMonday = 6;
    } else {
      daysFromMonday = dayOfWeek - 1;
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