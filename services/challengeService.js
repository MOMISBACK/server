// server/services/challengeService.js

const WeeklyChallenge = require('../models/WeeklyChallenge');
const Activity = require('../models/Activity');

class ChallengeService {
  
  // ⭐ Créer un challenge
  async createChallenge(userId, data) {
    const { goals, activityTypes, title, icon } = data;

    // Dates de la semaine (lundi-lundi)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
    
    const nextMonday = new Date(now);
    nextMonday.setDate(now.getDate() + daysUntilMonday);
    nextMonday.setHours(0, 0, 0, 0);
    
    const followingMonday = new Date(nextMonday);
    followingMonday.setDate(nextMonday.getDate() + 7);

    const challenge = new WeeklyChallenge({
      user: userId,
      goals,
      activityTypes,
      title,
      icon,
      startDate: nextMonday,
      endDate: followingMonday,
      progress: goals.map(g => ({
        goalType: g.type,
        current: 0,
        goal: g.value,
        percentage: 0,
        isCompleted: false
      })),
      overallProgress: {
        completedGoals: 0,
        totalGoals: goals.length,
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

    // ⭐ Calculer chaque objectif
    challenge.progress = challenge.goals.map(goal => {
      let current = 0;

      switch (goal.type) {
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

      const percentage = Math.min((current / goal.value) * 100, 100);
      const isCompleted = current >= goal.value;

      return {
        goalType: goal.type,
        current,
        goal: goal.value,
        percentage,
        isCompleted
      };
    });

    // ⭐ Progression globale
    const completedGoals = challenge.progress.filter(p => p.isCompleted).length;
    challenge.overallProgress = {
      completedGoals,
      totalGoals: challenge.goals.length,
      percentage: (completedGoals / challenge.goals.length) * 100,
      isCompleted: completedGoals === challenge.goals.length
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

    challenge.goals = data.goals;
    challenge.activityTypes = data.activityTypes;
    challenge.title = data.title;
    challenge.icon = data.icon;

    // Réinitialiser la progression
    challenge.progress = data.goals.map(g => ({
      goalType: g.type,
      current: 0,
      goal: g.value,
      percentage: 0,
      isCompleted: false
    }));

    challenge.overallProgress = {
      completedGoals: 0,
      totalGoals: data.goals.length,
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