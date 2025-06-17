const nodemailer = require('nodemailer')
const path = require('path')
const fs = require('fs').promises
const { createHash } = require('crypto')
const logger = require('../utils/logger')
const { StatusCodes } = require('http-status-codes')
const { ApiError } = require('../middleware/errorHandler')

const accountUsage = new Map()
let currentAccountIndex = 0
let accounts = []

const loadAccounts = async () => {
  try {
    const accountsPath = path.join(__dirname, '../config/accounts.json')
    const data = await fs.readFile(accountsPath, 'utf8')
    accounts = JSON.parse(data).accounts || []

    accounts.forEach((account) => {
      accountUsage.set(account.id, {
        sentToday: 0,
        lastReset: new Date().toDateString(),
        isRateLimited: false,
      })
    })

    logger.info(`Loaded ${accounts.length} email accounts`)
  } catch (error) {
    logger.error('Failed to load accounts:', error)
    throw new ApiError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      'Failed to initialize email accounts',
    )
  }
}

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

setInterval(checkAndResetLimits, 60 * 60 * 1000)

const getNextAccount = () => {
  checkAndResetLimits()
  if (!accounts.length) {
    throw new ApiError(
      StatusCodes.SERVICE_UNAVAILABLE,
      'No email accounts configured',
    )
  }

  for (let i = 0; i < accounts.length; i++) {
    currentAccountIndex = (currentAccountIndex + 1) % accounts.length
    const account = accounts[currentAccountIndex]
    const usage = accountUsage.get(account.id)

    if (
      !usage.isRateLimited &&
      (account.dailyLimit === undefined || usage.sentToday < account.dailyLimit)
    ) {
      return account
    }
  }

  throw new ApiError(
    StatusCodes.TOO_MANY_REQUESTS,
    'All email accounts have reached their daily sending limits',
  )
}

const generateMessageId = (email, domain) => {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 10)
  const hash = createHash('sha256')
    .update(`${email}${timestamp}${random}`)
    .digest('hex')
    .substring(0, 16)
  return `<${timestamp}.${hash}@${domain}>`
}

const sendEmail = async (to, content, accountId = null, retryCount = 0) => {
  const MAX_RETRIES = 3
  const RETRY_DELAY = 1000

  try {
    const account = accountId
      ? accounts.find((acc) => acc.id === accountId) ||
        (() => {
          throw new ApiError(
            StatusCodes.NOT_FOUND,
            `Account with ID ${accountId} not found`,
          )
        })()
      : getNextAccount()

    const usage = accountUsage.get(account.id)
    const transporter = nodemailer.createTransport({
      service: account.service,
      auth: { user: account.email, pass: account.password },
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      rateDelta: 1000,
      rateLimit: 100,
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
      ...(content.replyTo && { replyTo: content.replyTo }),
      ...(content.attachments && { attachments: content.attachments }),
    }

    logger.info(
      `Sending email from ${account.email} to ${to} with subject: ${content.subject}`,
    )
    const info = await transporter.sendMail(mailOptions)

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

    if ([421, 450, 550, 552, 554].includes(error.responseCode)) {
      const account = accountId
        ? accounts.find((acc) => acc.id === accountId)
        : accounts[currentAccountIndex]
      if (account) {
        accountUsage.get(account.id).isRateLimited = true
        logger.warn(`Account ${account.id} has been rate limited`)
      }
    }

    if (retryCount < MAX_RETRIES) {
      await new Promise((resolve) =>
        setTimeout(resolve, RETRY_DELAY * Math.pow(2, retryCount)),
      )
      return sendEmail(to, content, accountId, retryCount + 1)
    }

    throw new ApiError(
      StatusCodes.SERVICE_UNAVAILABLE,
      `Failed to send email after ${MAX_RETRIES} attempts: ${error.message}`,
    )
  }
}

loadAccounts().catch((error) => {
  logger.error('Failed to initialize email accounts:', error)
  process.exit(1)
})

module.exports = {
  sendEmail,
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
