require('dotenv').config()
const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const rateLimit = require('express-rate-limit')
const compression = require('compression')
const morgan = require('morgan')
const serverless = require('serverless-http')
const { StatusCodes } = require('http-status-codes')
const apiRoutes = require('./routes/api')
const { errorHandler } = require('./middleware/errorHandler')

// Initialize express app
const app = express()

// Configure Winston logger
const logger = {
  info: (message) =>
    console.log(`[${new Date().toISOString()}] [INFO]: ${message}`),
  error: (message) =>
    console.error(`[${new Date().toISOString()}] [ERROR]: ${message}`),
  warn: (message) =>
    console.warn(`[${new Date().toISOString()}] [WARN]: ${message}`),
}

// Security Middleware
app.use(helmet())
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
)

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
})
app.use('/api/', limiter)

// Request parsing
app.use(express.json({ limit: '10kb' }))
app.use(express.urlencoded({ extended: true, limit: '10kb' }))

// Compression
app.use(compression())

// Logging
app.use(
  morgan('combined', {
    stream: { write: (message) => logger.info(message.trim()) },
  }),
)

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(StatusCodes.OK).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  })
})

// API Routes
app.use('/api', apiRoutes)

// 404 handler
app.use((req, res) => {
  res.status(StatusCodes.NOT_FOUND).json({
    status: 'error',
    message: 'Resource not found',
    path: req.originalUrl,
  })
})

// Global error handler
app.use(errorHandler)

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`)
})

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error(`Uncaught Exception: ${error.message}`)
})

module.exports = app
module.exports.handler = serverless(app)

// Local server for development
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000
  const server = app.listen(PORT, () => {
    logger.info(
      `Server running in ${
        process.env.NODE_ENV || 'development'
      } mode on port ${PORT}`,
    )
  })

  server.on('error', (error) => {
    if (error.syscall !== 'listen') throw error
    switch (error.code) {
      case 'EACCES':
        logger.error(`Port ${PORT} requires elevated privileges`)
        process.exit(1)
      case 'EADDRINUSE':
        logger.error(`Port ${PORT} is already in use`)
        process.exit(1)
      default:
        throw error
    }
  })

  process.on('SIGTERM', () => {
    logger.info('SIGTERM received. Shutting down gracefully')
    server.close(() => {
      logger.info('Process terminated')
    })
  })
}
