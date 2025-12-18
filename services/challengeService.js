const WeeklyChallenge = require('../models/WeeklyChallenge');
const Activity = require('../models/Activity');

function getCurrentWeekStart() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysToSubtract);
  monday.setHours(0, 0, 0, 0);
  
  return monday;
}

function getCurrentWeekEnd() {
  const start = getCurrentWeekStart();
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return end;
}

async function getCurrentChallenge(userId) {
  const weekStart = getCurrentWeekStart();
  
  const challenge = await WeeklyChallenge.findOne({
    userId,
    startDate: weekStart
  });
  
  if (!challenge) return null;
  
  const progress = await calculateProgress(userId, challenge);
  
  return {
    ...challenge.toObject(),
    progress
  };
}

async function calculateProgress(userId, challenge) {
  // Debug (optionnel)
  console.log('calculateProgress:', {
    userId: userId.toString(),
    startDate: challenge.startDate.toISOString(),
    endDate: challenge.endDate.toISOString(),
    typesRecherchés: challenge.activityTypes,
    goalType: challenge.goalType,
    goalValue: challenge.goalValue
  });

  const activities = await Activity.find({
    user: userId,
    date: {
      $gte: challenge.startDate,
      $lt: challenge.endDate
    },
    type: { $in: challenge.activityTypes }
  });
  
  // Debug (optionnel)
  console.log('Activités trouvées:', {
    nombre: activities.length,
    détails: activities.map(a => ({
      id: a._id.toString(),
      type: a.type,
      date: a.date ? a.date.toISOString() : 'NO DATE',
      distance: a.distance || 0,
      duration: a.duration || 0
    }))
  });

  const allUserActivities = await Activity.find({ user: userId });
  
  // Debug (optionnel)
  console.log('Toutes les activités utilisateur:', {
    total: allUserActivities.length,
    détails: allUserActivities.map(a => ({
      type: a.type,
      date: a.date ? a.date.toISOString() : 'NO DATE',
      distance: a.distance,
      duration: a.duration
    }))
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
  
  // Debug (optionnel)
  console.log('Progression calculée:', {
    current: current.toFixed(2),
    goal: challenge.goalValue,
    percentage: percentage.toFixed(1) + '%',
    isCompleted
  });
  
  return {
    current: parseFloat(current.toFixed(2)),
    goal: challenge.goalValue,
    percentage: parseFloat(percentage.toFixed(1)),
    isCompleted,
    remainingActivities: activities.length
  };
}

async function createChallenge(userId, challengeData) {
  const weekStart = getCurrentWeekStart();
  const weekEnd = getCurrentWeekEnd();
  
  // Debug (optionnel)
  console.log('createChallenge:', {
    userId: userId.toString(),
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    ...challengeData
  });
  
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

async function getSuggestions(userId) {
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
  
  const recentActivities = await Activity.find({
    user: userId,
    date: { $gte: fourWeeksAgo }
  });
  
  if (recentActivities.length === 0) {
    return getDefaultSuggestions();
  }
  
  const typeStats = {};
  recentActivities.forEach(act => {
    if (!typeStats[act.type]) {
      typeStats[act.type] = { count: 0, totalDistance: 0, totalDuration: 0 };
    }
    typeStats[act.type].count++;
    typeStats[act.type].totalDistance += act.distance || 0;
    typeStats[act.type].totalDuration += act.duration || 0;
  });
  
  const topTypes = Object.entries(typeStats)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 3)
    .map(([type]) => type);
  
  const avgWeeklyDistance = Object.values(typeStats).reduce((s, v) => s + v.totalDistance, 0) / 4;
  const avgWeeklyDuration = Object.values(typeStats).reduce((s, v) => s + v.totalDuration, 0) / 4;
  const avgWeeklyCount = recentActivities.length / 4;
  
  return [
    {
      title: `${Math.ceil(avgWeeklyDistance * 1.2)} km cette semaine`,
      activityTypes: topTypes,
      goalType: 'distance',
      goalValue: Math.ceil(avgWeeklyDistance * 1.2),
      icon: 'trophy-outline'
    },
    {
      title: `${Math.ceil(avgWeeklyCount * 1.3)} activités`,
      activityTypes: topTypes,
      goalType: 'count',
      goalValue: Math.ceil(avgWeeklyCount * 1.3),
      icon: 'flag-outline'
    },
    {
      title: `${Math.ceil(avgWeeklyDuration * 1.1)} min d'effort`,
      activityTypes: topTypes,
      goalType: 'duration',
      goalValue: Math.ceil(avgWeeklyDuration * 1.1),
      icon: 'flame-outline'
    }
  ];
}

function getDefaultSuggestions() {
  return [
    {
      title: '3 activités cette semaine',
      activityTypes: ['running', 'walking'],
      goalType: 'count',
      goalValue: 3,
      icon: 'trophy-outline'
    },
    {
      title: '10 km de course',
      activityTypes: ['running'],
      goalType: 'distance',
      goalValue: 10,
      icon: 'flag-outline'
    },
    {
      title: '2h de sport',
      activityTypes: ['running', 'cycling', 'walking'],
      goalType: 'duration',
      goalValue: 120,
      icon: 'flame-outline'
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