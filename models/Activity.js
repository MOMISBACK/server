const mongoose = require('mongoose');

// Sous-schéma pour les exercices de musculation
const exerciseSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  sets: {
    type: Number,
    min: 0,
  },
  reps: {
    type: Number,
    min: 0,
  },
  weight: {
    type: Number,
    min: 0,
  },
});

const activitySchema = new mongoose.Schema({
  // --- Champs communs ---
  user: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User',
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  type: {
    type: String,
    required: true,
    enum: ['cycling', 'running', 'walking', 'swimming', 'workout', 'yoga'],
  },
  startTime: {
    type: Date,
  },
  endTime: {
    type: Date,
  },
  duration: {
    type: Number, // en minutes
    required: true,
    min: 0,
  },
  date: {
    type: Date, // pour les requêtes de classement
    required: true,
  },
  source: {
    type: String,
    enum: ['manual', 'tracked'],
  },

  // --- Champs spécifiques ---
  // Pour cycling, running, walking
  distance: {
    type: Number,
    min: 0,
  },
  elevationGain: { // D+ en mètres
    type: Number,
    min: 0,
  },
  avgSpeed: { // en km/h
    type: Number,
    min: 0,
  },

  // Pour swimming (en plus de distance)
  poolLength: { // en mètres
    type: Number,
    min: 0,
  },
  laps: {
    type: Number,
    min: 0,
  },

  // Pour workout
  exercises: [exerciseSchema],
}, {
  timestamps: true,
});

const allowedFieldsByType = {
  running: ['distance', 'elevationGain', 'avgSpeed'],
  cycling: ['distance', 'elevationGain', 'avgSpeed'],
  walking: ['distance'],
  swimming: ['distance', 'poolLength', 'laps'],
  workout: ['exercises'],
  yoga: [],
};

// Middleware de pré-validation pour nettoyer les données (synchrone)
activitySchema.pre('validate', function () {
  const type = this.type;
  const allowedSpecificFields = allowedFieldsByType[type];

  // Si le type n'est pas reconnu, laisser Mongoose gérer l'erreur enum
  if (!allowedSpecificFields) {
    return;
  }

  const allAllowedFields = new Set([
    // Champs communs autorisés
    'user', 'title', 'type', 'startTime', 'endTime', 'duration', 'date', 'source',
    // Champs ajoutés par Mongoose/MongoDB
    '_id', 'id', 'createdAt', 'updatedAt', '__v',
    // Champs spécifiques au type
    ...allowedSpecificFields
  ]);

  // Supprimer les champs non pertinents
  Object.keys(this.toObject()).forEach(key => {
    if (!allAllowedFields.has(key)) {
      this[key] = undefined; // Utiliser this[key] pour la modification directe
    }
  });
});

module.exports = mongoose.model('Activity', activitySchema);
