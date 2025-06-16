const nodemailer = require('nodemailer')
const path = require('path')
const fs = require('fs').promises
const { createHash } = require('crypto')
const logger = require('../utils/logger')
const { StatusCodes } = require('http-status-codes')
const { ApiError } = require('../middleware/errorHandler')

// In-memory store for rate limiting and account usage
const accountUsage = new Map()
let currentAccountIndex = 0

// Load accounts with error handling
let accounts = []
const loadAccounts = async () => {
  try {
    const accountsPath = path.join(__dirname, '../config/accounts.json')
    const data = await fs.readFile(accountsPath, 'utf8')
    const config = JSON.parse(data)

    if (!Array.isArray(config.accounts)) {
      throw new Error(
        'Invalid accounts configuration: expected an array of accounts',
      )
    }

    // Initialize account usage tracking
    config.accounts.forEach((account) => {
      if (!accountUsage.has(account.id)) {
        accountUsage.set(account.id, {
          sentToday: 0,
          lastReset: new Date().toDateString(),
          isRateLimited: false,
        })
      }
    })

    accounts = config.accounts
    logger.info(`Loaded ${accounts.length} email accounts`)
  } catch (error) {
    logger.error('Failed to load accounts:', error)
    process.exit(1)
  }
}

// Check and reset daily limits
const checkAndResetLimits = () => {
  const today = new Date().toDateString()

  accountUsage.forEach((usage, accountId) => {
    if (usage.lastReset !== today) {
      usage.sentToday = 0
      usage.lastReset = today
      usage.isRateLimited = false
    }
  })
}

// Schedule daily reset
setInterval(checkAndResetLimits, 60 * 60 * 1000) // Check every hour

// Get the next available account
const getNextAccount = () => {
  checkAndResetLimits()

  const totalAccounts = accounts.length
  if (totalAccounts === 0) {
    throw new ApiError(
      StatusCodes.SERVICE_UNAVAILABLE,
      'No email accounts configured',
    )
  }

  // Try to find an account that hasn't exceeded its daily limit
  for (let i = 0; i < totalAccounts; i++) {
    currentAccountIndex = (currentAccountIndex + 1) % totalAccounts
    const account = accounts[currentAccountIndex]
    const usage = accountUsage.get(account.id)

    if (
      !usage.isRateLimited &&
      (account.dailyLimit === undefined || usage.sentToday < account.dailyLimit)
    ) {
      return account
    }
  }

  // If all accounts are rate limited
  throw new ApiError(
    StatusCodes.TOO_MANY_REQUESTS,
    'All email accounts have reached their daily sending limits',
  )
}

// Generate a message ID
const generateMessageId = (email, domain) => {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 10)
  const hash = createHash('sha256')
    .update(`${email}${timestamp}${random}`)
    .digest('hex')
    .substring(0, 16)

  return `<${timestamp}.${hash}@${domain}>`
}

// Send email with retry logic
const sendEmail = async (to, content, accountId = null, retryCount = 0) => {
  const MAX_RETRIES = 3
  const RETRY_DELAY = 1000 // 1 second

  try {
    let account

    if (accountId) {
      // Use specific account if requested
      account = accounts.find((acc) => acc.id === accountId)
      if (!account) {
        throw new ApiError(
          StatusCodes.NOT_FOUND,
          `Account with ID ${accountId} not found`,
        )
      }
    } else {
      // Get next available account
      account = getNextAccount()
    }

    const usage = accountUsage.get(account.id)
    const transporter = nodemailer.createTransport({
      service: account.service,
      auth: {
        user: account.email,
        pass: account.password,
      },
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      rateDelta: 1000, // 1 second between messages
      rateLimit: 100, // Max 100 messages per rateDelta
    })

    const domain = account.email.split('@')[1]
    const messageId = generateMessageId(account.email, domain)

    const mailOptions = {
      from: `"${account.name || 'Property fees calculation'}" <${
        account.email
      }>`,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject: content.subject || 'No Subject',
      text: content.text || content.body || '',
      html: content.html,
      messageId,
      headers: {
        'X-Auto-Response-Suppress': 'OOF, AutoReply',
        Precedence: 'bulk',
      },
      dsn: {
        id: messageId,
        return: 'headers',
        notify: ['failure', 'delay'],
        recipient: account.email,
      },
    }

    // Add reply-to if specified
    if (content.replyTo) {
      mailOptions.replyTo = content.replyTo
    }

    // Add attachments if any
    if (content.attachments) {
      mailOptions.attachments = content.attachments
    }

    logger.info(
      `Sending email from ${account.email} to ${to} with subject: ${content.subject}`,
    )

    const info = await transporter.sendMail(mailOptions)

    // Update usage
    usage.sentToday++
    logger.info(`Email sent successfully. Message ID: ${info.messageId}`)

    return {
      success: true,
      messageId: info.messageId,
      accountId: account.id,
      sentAt: new Date().toISOString(),
      accepted: info.accepted,
      rejected: info.rejected,
    }
  } catch (error) {
    logger.error(`Failed to send email (attempt ${retryCount + 1}):`, error)

    // Mark account as rate limited if it's a rate limit error
    if (
      error.responseCode === 421 ||
      error.responseCode === 450 ||
      error.responseCode === 550 ||
      error.responseCode === 552 ||
      error.responseCode === 554
    ) {
      const account = accountId
        ? accounts.find((acc) => acc.id === accountId)
        : accounts[currentAccountIndex]

      if (account) {
        accountUsage.get(account.id).isRateLimited = true
        logger.warn(`Account ${account.id} has been rate limited`)
      }
    }

    // Retry with exponential backoff
    if (retryCount < MAX_RETRIES) {
      const delay = RETRY_DELAY * Math.pow(2, retryCount)
      logger.info(`Retrying in ${delay}ms...`)

      await new Promise((resolve) => setTimeout(resolve, delay))
      return sendEmail(to, content, accountId, retryCount + 1)
    }

    throw new ApiError(
      StatusCodes.SERVICE_UNAVAILABLE,
      `Failed to send email after ${MAX_RETRIES} attempts: ${error.message}`,
    )
  }
}

// Initialize accounts when the module loads
loadAccounts().catch((error) => {
  logger.error('Failed to initialize email accounts:', error)
  process.exit(1)
})

module.exports = {
  sendEmail,
  getAccountUsage: () => {
    const usage = {}
    accountUsage.forEach((value, key) => {
      usage[key] = { ...value }
    })
    return usage
  },
  getAccounts: () =>
    accounts.map((account) => ({
      id: account.id,
      email: account.email,
      service: account.service,
      dailyLimit: account.dailyLimit,
      sentToday: accountUsage.get(account.id)?.sentToday || 0,
      isRateLimited: accountUsage.get(account.id)?.isRateLimited || false,
    })),
}
