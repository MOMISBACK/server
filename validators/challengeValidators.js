const { body, validationResult } = require('express-validator');

const validateCreateChallenge = [
  body('activityTypes')
    .notEmpty().withMessage('Les types d\'activité sont obligatoires')
    .isArray({ min: 1, max: 6 })
    .withMessage('Sélectionnez entre 1 et 6 types d\'activité')
    .custom((types) => {
      const validTypes = ['running', 'cycling', 'walking', 'swimming', 'workout', 'yoga'];
      const invalidTypes = types.filter(type => !validTypes.includes(type));
      if (invalidTypes.length > 0) {
        throw new Error(`Types invalides : ${invalidTypes.join(', ')}`);
      }
      return true;
    }),

  body('goalType')
    .notEmpty().withMessage('Le type d\'objectif est obligatoire')
    .isIn(['distance', 'duration', 'count'])
    .withMessage('Type d\'objectif invalide (distance, duration ou count)'),

  body('goalValue')
    .notEmpty().withMessage('La valeur de l\'objectif est obligatoire')
    .isFloat({ min: 1, max: 10000 })
    .withMessage('La valeur de l\'objectif doit être entre 1 et 10000'),

  body('title')
    .notEmpty().withMessage('Le titre est obligatoire')
    .trim()
    .isLength({ min: 5, max: 100 })
    .withMessage('Le titre doit contenir entre 5 et 100 caractères')
    .escape(),

  body('icon')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('L\'icône ne peut pas dépasser 50 caractères'),

  (req, res, next) => {
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
  }
];

const validateUpdateChallenge = [
  body('activityTypes')
    .optional()
    .isArray({ min: 1, max: 6 })
    .withMessage('Sélectionnez entre 1 et 6 types d\'activité'),

  body('goalType')
    .optional()
    .isIn(['distance', 'duration', 'count'])
    .withMessage('Type d\'objectif invalide'),

  body('goalValue')
    .optional()
    .isFloat({ min: 1, max: 10000 })
    .withMessage('La valeur de l\'objectif doit être entre 1 et 10000'),

  body('title')
    .optional()
    .trim()
    .isLength({ min: 5, max: 100 })
    .withMessage('Le titre doit contenir entre 5 et 100 caractères')
    .escape(),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation échouée',
        errors: errors.array(),
      });
    }
    next();
  }
];

module.exports = {
  validateCreateChallenge,
  validateUpdateChallenge,
};
