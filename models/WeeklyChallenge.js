// server/models/WeeklyChallenge.js

const mongoose = require('mongoose');

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

const progressItemSchema = new mongoose.Schema({
  goalType: {
    type: String,
    enum: ['distance', 'duration', 'count']
  },
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
  
  goals: {
    type: [goalSchema],
    required: true,
    validate: {
      validator: function(v) {
        return v && v.length > 0;
      },
      message: 'Au moins un objectif requis'
    }
  },
  
  activityTypes: {
    type: [String],
    required: true,
    enum: ['running', 'cycling', 'walking', 'swimming', 'yoga', 'fitness', 'other']
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
  
  progress: [progressItemSchema],
  
  overallProgress: {
    completedGoals: {
      type: Number,
      default: 0
    },
    totalGoals: {
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
  }
}, {
  timestamps: true
});

weeklyChallengeSchema.index({ user: 1, startDate: -1 });

module.exports = mongoose.model('WeeklyChallenge', weeklyChallengeSchema);