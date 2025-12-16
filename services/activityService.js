const Activity = require('../models/Activity');
const activityTypeConfig = require('../utils/activityTypeConfig');

// Classe d'erreur personnalisée pour les erreurs de validation
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

/**
 * Gets activities based on a query object.
 * @param {object} query - The query object for filtering activities (e.g., { userId, type }).
 * @returns {Promise<Activity[]>} A list of activities.
 */
const getActivities = async (query) => {
  return await Activity.find(query).sort({ startTime: -1 });
};

/**
 * Creates a new activity after validating its fields based on type.
 * @param {object} activityData - The data for the new activity, including userId.
 * @returns {Promise<Activity>} The newly created activity.
 */
const createActivity = async (activityData) => {
  // --- Validation dynamique pour les entrées manuelles ---
  if (activityData.source === 'manual') {
    const { type } = activityData;
    const config = activityTypeConfig[type];

    if (!config) {
      throw new ValidationError(`Le type d'activité '${type}' est invalide.`);
    }

    const allowedFields = new Set(config.allowed);

    // On ne vérifie que les champs spécifiques à une activité
    const specificFieldsInRequest = Object.keys(activityData).filter(key =>
      !['user', 'userId', 'type', 'startTime', 'endTime', 'date', 'source'].includes(key)
    );

    for (const field of specificFieldsInRequest) {
      if (activityData[field] !== undefined && activityData[field] !== null) {
        if (!allowedFields.has(field)) {
          throw new ValidationError(`Le champ '${field}' n'est pas applicable pour le type '${type}'.`);
        }
      }
    }
  }

  // --- Création de l'activité ---
  const newActivity = new Activity(activityData);
  return await newActivity.save();
};

/**
 * Finds an activity by its ID.
 * @param {string} activityId - The ID of the activity.
 * @returns {Promise<Activity|null>} The found activity or null.
 */
const getActivityById = async (activityId) => {
  return await Activity.findById(activityId);
};

/**
 * Deletes an activity by its ID.
 * @param {string} activityId - The ID of the activity to delete.
 */
const deleteActivityById = async (activityId) => {
  await Activity.findByIdAndDelete(activityId);
};

module.exports = {
  getActivities,
  createActivity,
  getActivityById,
  deleteActivityById,
};
