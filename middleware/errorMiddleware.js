// middleware/errorMiddleware.js

const { AppError } = require('../utils/errors');

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  error.statusCode = err.statusCode || 500;

  // Log en développement
  if (process.env.NODE_ENV === 'development') {
    console.error('❌ Erreur:', err);
  }

  // Erreur MongoDB - Cast Error
  if (err.name === 'CastError') {
    error.message = 'Ressource non trouvée';
    error.statusCode = 404;
  }

  // Erreur MongoDB - Duplicate Key
  if (err.code === 11000) {
    error.message = 'Cette valeur existe déjà';
    error.statusCode = 400;
  }

  // Erreur MongoDB - Validation Error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(val => val.message);
    error.message = messages.join(', ');
    error.statusCode = 400;
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

  res.status(error.statusCode).json({
    success: false,
    message: error.message || 'Erreur serveur',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

// Middleware pour les erreurs async
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = { errorHandler, asyncHandler };