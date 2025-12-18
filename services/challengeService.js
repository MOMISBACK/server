const WeeklyChallenge = require('../models/WeeklyChallenge');
const Activity = require('../models/Activity');

/**
 * Calcule le début de la semaine en cours (dernier lundi à 00h00)
 */
function getCurrentWeekStart() {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = dimanche
  const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Lundi = référence
  
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysToSubtract);
  monday.setHours(0, 0, 0, 0);
  
  return monday;
}

/**
 * Calcule la fin de la semaine (lundi suivant à 00h00)
 */
function getCurrentWeekEnd() {
  const start = getCurrentWeekStart();
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return end;
}

/**
 * Récupère le défi actif de la semaine en cours
 */
async function getCurrentChallenge(userId) {
  const weekStart = getCurrentWeekStart();
  
  const challenge = await WeeklyChallenge.findOne({
    userId,
    startDate: weekStart
  });
  
  if (!challenge) return null;
  
  // Calculer la progression
  const progress = await calculateProgress(userId, challenge);
  
  return {
    ...challenge.toObject(),
    progress
  };
}

/**
 * Calcule la progression du défi basée sur les activités de la semaine
 */
async function calculateProgress(userId, challenge) {
  const activities = await Activity.find({
    userId,
    date: {
      $gte: challenge.startDate,
      $lt: challenge.endDate
    },
    type: { $in: challenge.activityTypes }
  });
  
  let current = 0;
  
  switch (challenge.goalType) {
    case 'distance':
      current = activities.reduce((sum, act) => sum + (act.distance || 0), 0);
      break;
    case 'duration':
      current = activities.reduce((sum, act) => sum + (act.duration || 0), 0);
      break;
    case 'count':
      current = activities.length;
      break;
  }
  
  const percentage = Math.min((current / challenge.goalValue) * 100, 100);
  const isCompleted = current >= challenge.goalValue;
  
  return {
    current: parseFloat(current.toFixed(2)),
    goal: challenge.goalValue,
    percentage: parseFloat(percentage.toFixed(1)),
    isCompleted,
    remainingActivities: activities.length
  };
}

/**
 * Crée un nouveau défi
 */
async function createChallenge(userId, challengeData) {
  const weekStart = getCurrentWeekStart();
  const weekEnd = getCurrentWeekEnd();
  
  // Vérifier qu'il n'existe pas déjà un défi cette semaine
  const existing = await WeeklyChallenge.findOne({
    userId,
    startDate: weekStart
  });
  
  if (existing) {
    throw new Error('Un défi existe déjà pour cette semaine');
  }
  
  const challenge = new WeeklyChallenge({
    userId,
    startDate: weekStart,
    endDate: weekEnd,
    ...challengeData
  });
  
  await challenge.save();
  return challenge;
}

/**
 * Modifie le défi de la semaine en cours
 */
async function updateChallenge(userId, challengeData) {
  const weekStart = getCurrentWeekStart();
  
  const challenge = await WeeklyChallenge.findOneAndUpdate(
    { userId, startDate: weekStart },
    { $set: challengeData },
    { new: true, runValidators: true }
  );
  
  if (!challenge) {
    throw new Error('Aucun défi trouvé pour cette semaine');
  }
  
  return challenge;
}

/**
 * Supprime le défi de la semaine en cours
 */
async function deleteChallenge(userId) {
  const weekStart = getCurrentWeekStart();
  
  const result = await WeeklyChallenge.findOneAndDelete({
    userId,
    startDate: weekStart
  });
  
  if (!result) {
    throw new Error('Aucun défi trouvé pour cette semaine');
  }
  
  return result;
}

/**
 * Génère des suggestions basées sur l'historique
 */
async function getSuggestions(userId) {
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
  
  const recentActivities = await Activity.find({
    userId,
    date: { $gte: fourWeeksAgo }
  });
  
  if (recentActivities.length === 0) {
    return getDefaultSuggestions();
  }
  
  // Analyse des types les plus fréquents
  const typeStats = {};
  recentActivities.forEach(act => {
    if (!typeStats[act.type]) {
      typeStats[act.type] = { count: 0, totalDistance: 0, totalDuration: 0 };
    }
    typeStats[act.type].count++;
    typeStats[act.type].totalDistance += act.distance || 0;
    typeStats[act.type].totalDuration += act.duration || 0;
  });
  
  // Top 3 types d'activités
  const topTypes = Object.entries(typeStats)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 3)
    .map(([type]) => type);
  
  // Moyennes hebdomadaires
  const avgWeeklyDistance = Object.values(typeStats).reduce((s, v) => s + v.totalDistance, 0) / 4;
  const avgWeeklyDuration = Object.values(typeStats).reduce((s, v) => s + v.totalDuration, 0) / 4;
  const avgWeeklyCount = recentActivities.length / 4;
  
  return [
    {
      title: `${Math.ceil(avgWeeklyDistance * 1.2)} km cette semaine`,
      activityTypes: topTypes,
      goalType: 'distance',
      goalValue: Math.ceil(avgWeeklyDistance * 1.2),
      icon: '🏃'
    },
    {
      title: `${Math.ceil(avgWeeklyCount * 1.3)} activités`,
      activityTypes: topTypes,
      goalType: 'count',
      goalValue: Math.ceil(avgWeeklyCount * 1.3),
      icon: '🎯'
    },
    {
      title: `${Math.ceil(avgWeeklyDuration * 1.1)} min d'effort`,
      activityTypes: topTypes,
      goalType: 'duration',
      goalValue: Math.ceil(avgWeeklyDuration * 1.1),
      icon: '⏱️'
    }
  ];
}

/**
 * Suggestions par défaut (nouveaux utilisateurs)
 */
function getDefaultSuggestions() {
  return [
    {
      title: '3 activités cette semaine',
      activityTypes: ['running', 'walking'],
      goalType: 'count',
      goalValue: 3,
      icon: '🎯'
    },
    {
      title: '10 km de course',
      activityTypes: ['running'],
      goalType: 'distance',
      goalValue: 10,
      icon: '🏃'
    },
    {
      title: '2h de sport',
      activityTypes: ['running', 'cycling', 'walking'],
      goalType: 'duration',
      goalValue: 120,
      icon: '⏱️'
    }
  ];
}

module.exports = {
  getCurrentChallenge,
  createChallenge,
  updateChallenge,
  deleteChallenge,
  getSuggestions,
  calculateProgress
};