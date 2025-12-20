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

    // Dates de la semaine (maintenant à 7 jours plus tard)
    const now = new Date();
    const startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0); // Début du jour actuel

    const endDate = new Date(now);
    endDate.setDate(now.getDate() + 7);
    endDate.setHours(23, 59, 59, 999); // Fin du jour 7 jours plus tard

    const challenge = new WeeklyChallenge({
      user: userId,
      goal,
      activityTypes,
      title,
      icon,
      startDate,
      endDate,
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

    // ⭐ Calculer la progression selon le type d'objectif
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

    // Mise à jour de la progression
    challenge.progress = {
      current,
      goal: challenge.goal.value,
      percentage: Math.min((current / challenge.goal.value) * 100, 100),
      isCompleted: current >= challenge.goal.value
    };

    await challenge.save();
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