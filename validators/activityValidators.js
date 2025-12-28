// validators/activityValidator.js

const { body, validationResult } = require('express-validator');

/**
 * Configuration des champs autorisés par type d'activité
 * Inclut les champs enrichis importés depuis Health Connect / Apple Health
 */
const ALLOWED_FIELDS = {
  running: ['distance', 'elevationGain', 'avgSpeed', 'calories', 'heartRateAvg', 'heartRateMax', 'steps', 'importNotes'],
  cycling: ['distance', 'elevationGain', 'avgSpeed', 'calories', 'heartRateAvg', 'heartRateMax', 'importNotes'],
  walking: ['distance', 'calories', 'heartRateAvg', 'heartRateMax', 'steps', 'importNotes'],
  swimming: ['distance', 'poolLength', 'laps', 'calories', 'heartRateAvg', 'heartRateMax', 'importNotes'],
  workout: ['exercises', 'calories', 'heartRateAvg', 'heartRateMax', 'importNotes'],
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
    'type', 'title', 'duration', 'date', 'startTime', 'endTime', 'source', 'externalSource', 'externalId',
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
    .isIn(['running', 'cycling', 'walking', 'swimming', 'workout'])
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

  body('externalSource')
    .optional()
    .isIn(['appleHealth', 'healthConnect'])
    .withMessage('externalSource invalide'),

  body('externalId')
    .optional()
    .isString()
    .isLength({ min: 1, max: 200 })
    .withMessage('externalId invalide'),
];

/**
 * Règles pour les activités avec distance
 * Note: La distance n'est PAS obligatoire pour les activités importées (Health Connect peut ne pas fournir cette donnée)
 */
const distanceValidation = [
  body('distance')
    .custom((value, { req }) => {
      const type = req.body.type;
      const externalSource = req.body.externalSource;
      const needsDistance = ['running', 'cycling', 'walking', 'swimming'].includes(type);
      const isImported = !!externalSource; // If externalSource is present, it's an imported activity
      
      // Distance is required only for manual activities (no externalSource) of distance-based types
      if (needsDistance && !isImported && (value === undefined || value === null || value === '')) {
        throw new Error('La distance est obligatoire pour ce type d\'activité');
      }
      
      // If distance is provided, validate it
      if (value !== undefined && value !== null && value !== '') {
        const numValue = parseFloat(value);
        if (isNaN(numValue) || numValue < 0 || numValue > 1000) {
          throw new Error('La distance doit être entre 0 et 1000 km');
        }
      }
      
      return true;
    }),
  
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
 * Règles pour les données enrichies (import santé)
 * Ces champs sont optionnels et proviennent des imports Health Connect / Apple Health
 */
const enrichedDataValidation = [
  body('calories')
    .optional()
    .isFloat({ min: 0, max: 50000 })
    .withMessage('Les calories doivent être entre 0 et 50000 kcal'),
  
  body('heartRateAvg')
    .optional()
    .isInt({ min: 30, max: 250 })
    .withMessage('La fréquence cardiaque moyenne doit être entre 30 et 250 bpm'),
  
  body('heartRateMax')
    .optional()
    .isInt({ min: 30, max: 250 })
    .withMessage('La fréquence cardiaque max doit être entre 30 et 250 bpm'),
  
  body('steps')
    .optional()
    .isInt({ min: 0, max: 500000 })
    .withMessage('Le nombre de pas doit être entre 0 et 500000'),
  
  body('importNotes')
    .optional()
    .isString()
    .isLength({ max: 200 })
    .withMessage('Les notes d\'import ne doivent pas dépasser 200 caractères'),
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
  ...enrichedDataValidation,
  handleValidationErrors,
];

module.exports = {
  validateCreateActivity,
  handleValidationErrors,
};