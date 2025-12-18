const mongoose = require('mongoose');

const weeklyChallengeSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Période du défi
  startDate: {
    type: Date,
    required: true,
    // Toujours un lundi à 00h00
  },
  endDate: {
    type: Date,
    required: true,
    // Toujours le lundi suivant à 00h00
  },
  
  // Configuration du défi
  activityTypes: [{
    type: String,
    enum: ['running', 'cycling', 'walking', 'swimming', 'workout', 'yoga'],
    required: true
  }],
  
  goalType: {
    type: String,
    enum: ['distance', 'duration', 'count'],
    required: true
  },
  
  goalValue: {
    type: Number,
    required: true,
    min: 1
  },
  
  title: {
    type: String,
    required: true,
    maxlength: 100
  },
  
  // Optionnel : emoji ou couleur
  icon: {
    type: String,
    default: '🎯'
  },
  
}, {
  timestamps: true
});

// Index composé pour garantir 1 seul défi actif par user/semaine
weeklyChallengeSchema.index(
  { userId: 1, startDate: 1 }, 
  { unique: true }
);

module.exports = mongoose.model('WeeklyChallenge', weeklyChallengeSchema);