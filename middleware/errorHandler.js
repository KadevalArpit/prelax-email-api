const { StatusCodes } = require('http-status-codes')
const logger = require('../utils/logger')

class ApiError extends Error {
  constructor(statusCode, message, isOperational = true, details = null) {
    super(message)
    this.statusCode = statusCode
    this.isOperational = isOperational
    this.details = details
    Error.captureStackTrace(this, this.constructor)
  }
}

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR
  let message = err.message || 'Internal Server Error'
  let details = err.details

  if (err.isJoi) {
    statusCode = StatusCodes.BAD_REQUEST
    message = 'Validation error'
    details = err.details.map((detail) => ({
      message: detail.message,
      path: detail.path,
      type: detail.type,
    }))
  }

  if (err.type === 'entity.parse.failed') {
    statusCode = StatusCodes.BAD_REQUEST
    message = 'Invalid JSON payload'
  }

  logger.error(
    `${statusCode} - ${message} - ${req.originalUrl} - ${req.method} - ${req.ip}`,
  )
  if (process.env.NODE_ENV === 'development') {
    logger.error(err.stack)
  }

  res.status(statusCode).json({
    status: 'error',
    message:
      statusCode === StatusCodes.INTERNAL_SERVER_ERROR &&
      process.env.NODE_ENV !== 'development'
        ? 'An unexpected error occurred'
        : message,
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
      details,
    }),
  })
}

module.exports = { errorHandler, ApiError }
