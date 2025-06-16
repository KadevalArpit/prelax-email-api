const { StatusCodes } = require('http-status-codes');
const logger = require('../utils/logger');

class ApiError extends Error {
  constructor(statusCode, message, isOperational = true, stack = '') {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

const errorHandler = (err, req, res, next) => {
  let { statusCode = StatusCodes.INTERNAL_SERVER_ERROR, message } = err;
  
  // Handle Joi validation errors
  if (err.isJoi) {
    statusCode = StatusCodes.BAD_REQUEST;
    message = err.details.map(e => e.message).join('; ');
  }
  
  // Handle multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = StatusCodes.BAD_REQUEST;
    message = 'File size is too large. Maximum allowed size is 5MB';
  }

  // Handle invalid JSON
  if (err.type === 'entity.parse.failed') {
    statusCode = StatusCodes.BAD_REQUEST;
    message = 'Invalid JSON payload';
  }

  // Log the error
  const errorResponse = {
    status: 'error',
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  };

  // Log the full error in development, otherwise just the message
  if (process.env.NODE_ENV === 'development') {
    logger.error(`${err.statusCode || 500} - ${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);
    logger.error(err.stack);
  } else {
    logger.error(`${err.statusCode || 500} - ${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);
  }

  // Prevent leaking error details in production
  if (statusCode === StatusCodes.INTERNAL_SERVER_ERROR && process.env.NODE_ENV !== 'development') {
    errorResponse.message = 'An unexpected error occurred';
  }

  res.status(statusCode).json(errorResponse);
};

const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(StatusCodes.NOT_FOUND);
  next(error);
};

const errorConverter = (err, req, res, next) => {
  let error = err;
  
  if (!(error instanceof ApiError)) {
    const statusCode = error.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
    const message = error.message || 'Internal Server Error';
    error = new ApiError(statusCode, message, false, err.stack);
  }
  
  next(error);
};

module.exports = {
  errorHandler,
  notFound,
  errorConverter,
  ApiError
};
