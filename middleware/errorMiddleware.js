const { AppError } = require('../utils/errors');

/**
 * Middleware de gestion centralisée des erreurs
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log l'erreur en développement
  if (process.env.NODE_ENV !== 'test') {
    console.error('❌ Error:', {
      name: err.name,
      message: err.message,
      statusCode: err.statusCode,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }

  // Erreur Mongoose - CastError (ID invalide)
  if (err.name === 'CastError') {
    error.message = 'Ressource introuvable (ID invalide)';
    error.statusCode = 404;
  }

  // Erreur Mongoose - Duplicate Key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'Champ';
    error.message = `${field} existe déjà`;
    error.statusCode = 409;
  }

  // Erreur Mongoose - Validation
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => ({
      field: e.path,
      message: e.message,
    }));
    error.message = 'Erreur de validation';
    error.statusCode = 400;
    error.errors = errors;
  }

  // Erreur JWT - Token invalide
  if (err.name === 'JsonWebTokenError') {
    error.message = 'Token invalide';
    error.statusCode = 401;
  }

  // Erreur JWT - Token expiré
  if (err.name === 'TokenExpiredError') {
    error.message = 'Token expiré';
    error.statusCode = 401;
  }

  // Réponse JSON uniformisée
  const statusCode = error.statusCode || err.statusCode || 500;
  
  res.status(statusCode).json({
    success: false,
    message: error.message || err.message || 'Erreur serveur',
    ...(error.errors && { errors: error.errors }),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = { errorHandler };
