// validators/activityValidator.js

const { body, validationResult } = require('express-validator');

/**
 * Configuration des champs autorisés par type d'activité
 */
const ALLOWED_FIELDS = {
  running: ['distance', 'elevationGain', 'avgSpeed'],
  cycling: ['distance', 'elevationGain', 'avgSpeed'],
  walking: ['distance', 'elevationGain', 'avgSpeed'],
  swimming: ['distance', 'poolLength', 'laps'],
  workout: ['exercises'],
  yoga: [], // Pas de champs spécifiques
};

/**
 * Middleware pour valider les champs selon le type d'activité
 */
const validateActivityFields = (req, res, next) => {
  const { type } = req.body;
  
  if (!type || !ALLOWED_FIELDS[type]) {
    return next(); // La validation du type se fera après
  }

  // ⭐ CORRECTION : Ajouter user, userId, notes
  const allowedFields = [
    'type', 'title', 'duration', 'date', 'startTime', 'endTime', 'source',
    'user', 'userId', 'notes', // ⭐ AJOUTÉ
    ...ALLOWED_FIELDS[type]
  ];

  const receivedFields = Object.keys(req.body);
  const invalidFields = receivedFields.filter(field => !allowedFields.includes(field));

  if (invalidFields.length > 0) {
    return res.status(400).json({
      success: false,
      message: `Champs non autorisés pour le type "${type}"`,
      invalidFields,
      allowedFields: ALLOWED_FIELDS[type],
    });
  }

  next();
};

/**
 * Règles de validation communes
 */
const commonValidation = [
  body('type')
    .notEmpty().withMessage('Le type est obligatoire')
    .isIn(['running', 'cycling', 'walking', 'swimming', 'workout', 'yoga'])
    .withMessage('Type d\'activité invalide'),
  
  body('title')
    .notEmpty().withMessage('Le titre est obligatoire')
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('Le titre doit contenir entre 3 et 100 caractères')
    .escape(),
  
  body('duration')
    .notEmpty().withMessage('La durée est obligatoire')
    .isFloat({ min: 1, max: 1440 })
    .withMessage('La durée doit être entre 1 et 1440 minutes (24h)'),
  
  body('date')
    .notEmpty().withMessage('La date est obligatoire')
    .isISO8601().withMessage('Format de date invalide (ISO 8601 requis)')
    .toDate(),
  
  body('startTime')
    .optional()
    .isISO8601().withMessage('Format startTime invalide')
    .toDate(),
  
  body('endTime')
    .optional()
    .isISO8601().withMessage('Format endTime invalide')
    .toDate(),
  
  // ⭐ AJOUT : Validation pour notes (optionnel)
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Les notes ne doivent pas dépasser 500 caractères')
    .escape(),
];

/**
 * Règles pour les activités avec distance
 */
const distanceValidation = [
  body('distance')
    .if(body('type').isIn(['running', 'cycling', 'walking', 'swimming']))
    .notEmpty().withMessage('La distance est obligatoire pour ce type d\'activité')
    .isFloat({ min: 0.01, max: 1000 })
    .withMessage('La distance doit être entre 0.01 et 1000 km'),
  
  body('elevationGain')
    .optional()
    .isFloat({ min: 0, max: 10000 })
    .withMessage('Le dénivelé doit être entre 0 et 10000 mètres'),
  
  body('avgSpeed')
    .optional()
    .isFloat({ min: 0.1, max: 150 })
    .withMessage('La vitesse moyenne doit être entre 0.1 et 150 km/h'),
];

/**
 * Règles pour la natation
 */
const swimmingValidation = [
  body('poolLength')
    .if(body('type').equals('swimming'))
    .optional()
    .isInt({ min: 10, max: 100 })
    .withMessage('La longueur du bassin doit être entre 10 et 100 mètres'),
  
  body('laps')
    .if(body('type').equals('swimming'))
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Le nombre de longueurs doit être entre 1 et 1000'),
];

/**
 * Règles pour le workout (musculation)
 */
const workoutValidation = [
  body('exercises')
    .if(body('type').equals('workout'))
    .optional()
    .isArray().withMessage('exercises doit être un tableau')
    .custom((exercises) => {
      if (!Array.isArray(exercises)) return true;
      
      for (const exercise of exercises) {
        if (!exercise.name || typeof exercise.name !== 'string') {
          throw new Error('Chaque exercice doit avoir un nom (string)');
        }
        if (exercise.sets && (exercise.sets < 1 || exercise.sets > 100)) {
          throw new Error('Le nombre de séries doit être entre 1 et 100');
        }
        if (exercise.reps && (exercise.reps < 1 || exercise.reps > 1000)) {
          throw new Error('Le nombre de répétitions doit être entre 1 et 1000');
        }
        if (exercise.weight && (exercise.weight < 0 || exercise.weight > 1000)) {
          throw new Error('Le poids doit être entre 0 et 1000 kg');
        }
      }
      return true;
    }),
];

/**
 * Middleware pour gérer les erreurs de validation
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(err => ({
      field: err.path || err.param,
      message: err.msg,
      value: err.value,
    }));

    return res.status(400).json({
      success: false,
      message: 'Validation échouée',
      errors: formattedErrors,
    });
  }
  
  next();
};

/**
 * Combinaison complète de toutes les validations
 */
const validateCreateActivity = [
  validateActivityFields,
  ...commonValidation,
  ...distanceValidation,
  ...swimmingValidation,
  ...workoutValidation,
  handleValidationErrors,
];

module.exports = {
  validateCreateActivity,
  handleValidationErrors,
};