// server/models/WeeklyChallenge.js

const mongoose = require('mongoose');

// ✅ SIMPLIFIÉ : Un seul objectif (au lieu d'un array)
const goalSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['distance', 'duration', 'count'],
    required: true
  },
  value: {
    type: Number,
    required: true,
    min: [0.1, 'La valeur doit être positive']
  }
}, { _id: false });

// ✅ SIMPLIFIÉ : Une seule progression (au lieu d'un array)
const progressSchema = new mongoose.Schema({
  current: {
    type: Number,
    default: 0
  },
  goal: {
    type: Number,
    required: true
  },
  percentage: {
    type: Number,
    default: 0
  },
  isCompleted: {
    type: Boolean,
    default: false
  }
}, { _id: false });

const weeklyChallengeSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // ✅ SINGULAR : un seul objectif
  goal: {
    type: goalSchema,
    required: true
  },
  
  activityTypes: {
    type: [String],
    required: true,
    enum: ['running', 'cycling', 'walking', 'swimming', 'yoga', 'workout']
  },
  
  title: {
    type: String,
    required: true
  },
  
  icon: {
    type: String,
    default: 'trophy-outline'
  },
  
  startDate: {
    type: Date,
    required: true
  },
  
  endDate: {
    type: Date,
    required: true
  },
  
  // ✅ SINGULAR : une seule progression
  progress: {
    type: progressSchema,
    required: true
  }
}, {
  timestamps: true
});

weeklyChallengeSchema.index({ user: 1, startDate: -1 });

module.exports = mongoose.model('WeeklyChallenge', weeklyChallengeSchema);