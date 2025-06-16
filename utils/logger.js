// const winston = require('winston')

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

module.exports = logger
