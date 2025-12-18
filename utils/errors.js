/**
 * Classe de base pour toutes les erreurs personnalisées
 */
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true; // Erreur prévue (pas un bug)
    
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Erreur 400 - Bad Request
 */
class BadRequestError extends AppError {
  constructor(message = 'Requête invalide') {
    super(message, 400);
  }
}

/**
 * Erreur 401 - Unauthorized
 */
class UnauthorizedError extends AppError {
  constructor(message = 'Non authentifié') {
    super(message, 401);
  }
}

/**
 * Erreur 403 - Forbidden
 */
class ForbiddenError extends AppError {
  constructor(message = 'Accès refusé') {
    super(message, 403);
  }
}

/**
 * Erreur 404 - Not Found
 */
class NotFoundError extends AppError {
  constructor(resource = 'Ressource') {
    super(`${resource} introuvable`, 404);
  }
}

/**
 * Erreur 409 - Conflict
 */
class ConflictError extends AppError {
  constructor(message = 'Conflit détecté') {
    super(message, 409);
  }
}

/**
 * Erreur 422 - Validation Error
 */
class ValidationError extends AppError {
  constructor(errors) {
    super('Erreur de validation', 422);
    this.errors = errors;
  }
}

module.exports = {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
};
