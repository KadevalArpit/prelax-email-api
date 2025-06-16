require('dotenv').config()
const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const rateLimit = require('express-rate-limit')
const compression = require('compression')
const morgan = require('morgan')
const path = require('path')
const fs = require('fs')
const { createLogger, format, transports } = require('winston')
const { StatusCodes } = require('http-status-codes')
const apiRoutes = require('./routes/api')
const { errorHandler } = require('./middleware/errorHandler')

// Initialize express app
const app = express()

// Configure Winston logger
const logger = {
  info: (message) => {
    console.log(`[${new Date().toISOString()}] [INFO]: ${message}`)
  },
  error: (message) => {
    console.error(`[${new Date().toISOString()}] [ERROR]: ${message}`)
  },
  warn: (message) => {
    console.warn(`[${new Date().toISOString()}] [WARN]: ${message}`)
  },
  debug: (message) => {
    console.debug(`[${new Date().toISOString()}] [DEBUG]: ${message}`)
  },
}

// Ensure required directories exist
const requiredDirs = ['uploads', 'logs']
requiredDirs.forEach((dir) => {
  const dirPath = path.join(__dirname, dir)
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
})

// Security Middleware
app.use(helmet())
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',')
      : '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
)

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
})

// Apply rate limiting to all API routes
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
  res
    .status(StatusCodes.OK)
    .json({ status: 'ok', timestamp: new Date().toISOString() })
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
  // Consider restarting the process in production
  // process.exit(1);
})

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error(`Uncaught Exception: ${error.message}`, error)
  // Consider restarting the process in production
  // process.exit(1);
})

const PORT = process.env.PORT || 3000
const server = app.listen(PORT, () => {
  logger.info(
    `Server running in ${
      process.env.NODE_ENV || 'development'
    } mode on port ${PORT}`,
  )
})

// Handle server errors
server.on('error', (error) => {
  if (error.syscall !== 'listen') {
    throw error
  }

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

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully')
  server.close(() => {
    logger.info('Process terminated')
  })
})

module.exports = { app, server }
