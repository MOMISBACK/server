// server/services/challengeService.js

const WeeklyChallenge = require('../models/WeeklyChallenge');
const Activity = require('../models/Activity');

class ChallengeService {
  
  // ⭐ Créer un challenge
  async createChallenge(userId, data) {
    const { goal, activityTypes, title, icon } = data;

    // Validation : un seul objectif
    if (!goal || !goal.type || !goal.value) {
      throw new Error('Un objectif valide est requis');
    }

    // ✅ CORRIGÉ : Challenge commence le LUNDI DE CETTE SEMAINE (pas le prochain)
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = dimanche, 1 = lundi, ..., 6 = samedi
    
    // Calculer le lundi de cette semaine
    let daysFromMonday;
    if (dayOfWeek === 0) {
      // Si dimanche, le lundi était il y a 6 jours
      daysFromMonday = 6;
    } else {
      // Sinon, c'est dayOfWeek - 1 (ex: mardi = 2, donc 2-1 = 1 jour depuis lundi)
      daysFromMonday = dayOfWeek - 1;
    }
    
    const thisMonday = new Date(now);
    thisMonday.setDate(now.getDate() - daysFromMonday);
    thisMonday.setHours(0, 0, 0, 0);
    
    // Le lundi suivant (fin du challenge)
    const nextMonday = new Date(thisMonday);
    nextMonday.setDate(thisMonday.getDate() + 7);
    nextMonday.setHours(0, 0, 0, 0);

    console.log('📅 Dates du challenge:', {
      aujourdhui: now.toISOString(),
      debut: thisMonday.toISOString(),
      fin: nextMonday.toISOString()
    });

    const challenge = new WeeklyChallenge({
      user: userId,
      goal,
      activityTypes,
      title,
      icon,
      startDate: thisMonday,      // ✅ LUNDI DE CETTE SEMAINE
      endDate: nextMonday,         // ✅ LUNDI PROCHAIN
      progress: {
        current: 0,
        goal: goal.value,
        percentage: 0,
        isCompleted: false
      }
    });

    await challenge.save();
    return challenge;
  }

  // ⭐ Calculer la progression
  async calculateProgress(userId) {
    const challenge = await WeeklyChallenge.findOne({
      user: userId,
      endDate: { $gt: new Date() }
    });

    if (!challenge) return null;

    // Activités de la semaine qui correspondent
    const activities = await Activity.find({
      user: userId,
      date: {
        $gte: challenge.startDate,
        $lt: challenge.endDate
      },
      type: { $in: challenge.activityTypes }
    });

    console.log('📊 Calcul progression:', {
      challengeId: challenge._id,
      periodeDebut: challenge.startDate,
      periodeFin: challenge.endDate,
      activitesTrouvees: activities.length,
      typesRecherches: challenge.activityTypes
    });

    // ⭐ Calculer la progression selon le type d'objectif
    let current = 0;

    switch (challenge.goal.type) {
      case 'distance':
        current = activities.reduce((sum, a) => sum + (a.distance || 0), 0);
        console.log('📏 Distance totale:', current, 'km');
        break;
      case 'duration':
        current = activities.reduce((sum, a) => sum + (a.duration || 0), 0);
        console.log('⏱️ Durée totale:', current, 'min');
        break;
      case 'count':
        current = activities.length;
        console.log('🔢 Nombre d\'activités:', current);
        break;
    }

    // Mise à jour de la progression
    challenge.progress = {
      current,
      goal: challenge.goal.value,
      percentage: Math.min((current / challenge.goal.value) * 100, 100),
      isCompleted: current >= challenge.goal.value
    };

    await challenge.save();
    console.log('✅ Progression mise à jour:', challenge.progress);
    return challenge;
  }

  // Récupérer le challenge actif
  async getCurrentChallenge(userId) {
    const challenge = await WeeklyChallenge.findOne({
      user: userId,
      endDate: { $gt: new Date() }
    }).sort({ createdAt: -1 });

    if (challenge) {
      return await this.calculateProgress(userId);
    }

    return null;
  }

  // Mettre à jour
  async updateChallenge(userId, data) {
    const challenge = await WeeklyChallenge.findOne({
      user: userId,
      endDate: { $gt: new Date() }
    });

    if (!challenge) {
      throw new Error('Aucun challenge actif');
    }

    // Validation : un seul objectif
    if (!data.goal || !data.goal.type || !data.goal.value) {
      throw new Error('Un objectif valide est requis');
    }

    challenge.goal = data.goal;
    challenge.activityTypes = data.activityTypes;
    challenge.title = data.title;
    challenge.icon = data.icon;

    // Réinitialiser la progression
    challenge.progress = {
      current: 0,
      goal: data.goal.value,
      percentage: 0,
      isCompleted: false
    };

    await challenge.save();
    return await this.calculateProgress(userId);
  }

  // Supprimer
  async deleteChallenge(userId) {
    const result = await WeeklyChallenge.findOneAndDelete({
      user: userId,
      endDate: { $gt: new Date() }
    });

    if (!result) {
      throw new Error('Aucun challenge actif');
    }

    return { success: true };
  }
}

module.exports = new ChallengeService();