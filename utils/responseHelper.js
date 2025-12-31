// server/utils/responseHelper.js
// Standardized API response helpers
// Consolidates inconsistent response formats ({message} vs {success, data})

/**
 * Send a successful JSON response
 * @param {object} res - Express response object
 * @param {*} data - Data to send (can be object, array, or primitive)
 * @param {number} [statusCode=200] - HTTP status code
 */
function sendSuccess(res, data, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
  });
}

/**
 * Send a successful JSON response with a message
 * @param {object} res - Express response object
 * @param {string} message - Success message
 * @param {*} [data] - Optional data to include
 * @param {number} [statusCode=200] - HTTP status code
 */
function sendSuccessMessage(res, message, data = undefined, statusCode = 200) {
  const response = { success: true, message };
  if (data !== undefined) {
    response.data = data;
  }
  return res.status(statusCode).json(response);
}

/**
 * Send an error JSON response
 * @param {object} res - Express response object
 * @param {string} message - Error message
 * @param {number} [statusCode=400] - HTTP status code
 * @param {*} [errors] - Optional validation errors array
 */
function sendError(res, message, statusCode = 400, errors = undefined) {
  const response = { success: false, message };
  if (errors !== undefined) {
    response.errors = errors;
  }
  return res.status(statusCode).json(response);
}

/**
 * Send a not found error
 * @param {object} res - Express response object
 * @param {string} [message='Resource not found'] - Error message
 */
function sendNotFound(res, message = 'Resource not found') {
  return sendError(res, message, 404);
}

/**
 * Send an unauthorized error
 * @param {object} res - Express response object
 * @param {string} [message='Unauthorized'] - Error message
 */
function sendUnauthorized(res, message = 'Unauthorized') {
  return sendError(res, message, 401);
}

/**
 * Send a forbidden error
 * @param {object} res - Express response object
 * @param {string} [message='Forbidden'] - Error message
 */
function sendForbidden(res, message = 'Forbidden') {
  return sendError(res, message, 403);
}

/**
 * Send a server error
 * @param {object} res - Express response object
 * @param {Error|string} error - Error object or message
 */
function sendServerError(res, error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[ServerError]', message);
  return sendError(res, message, 500);
}

/**
 * Send a validation error with field-level errors
 * @param {object} res - Express response object
 * @param {string} message - Main error message
 * @param {Array} errors - Array of validation errors
 */
function sendValidationError(res, message, errors = []) {
  return sendError(res, message, 400, errors);
}

/**
 * Send created response (201)
 * @param {object} res - Express response object
 * @param {*} data - Created resource data
 */
function sendCreated(res, data) {
  return sendSuccess(res, data, 201);
}

module.exports = {
  sendSuccess,
  sendSuccessMessage,
  sendError,
  sendNotFound,
  sendUnauthorized,
  sendForbidden,
  sendServerError,
  sendValidationError,
  sendCreated,
};
