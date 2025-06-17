const express = require('express')
const { body, param, validationResult } = require('express-validator')
const { StatusCodes } = require('http-status-codes')
const emailController = require('../controllers/emailController')
const { ApiError } = require('../middleware/errorHandler')
const logger = require('../utils/logger')

const router = express.Router()

const emailTemplate = {
  text: `Dear {recipientName},

I’m <strong>Shailesh Sakariya</strong>, CTO at Prelax Infotech.

We’ve developed a smart and efficient tool tailored for property valuation professionals to <strong>automatically calculate valuation charges</strong> as per varying bank rules — a task that’s often manual and time-consuming.

🔧 <strong>Key Features:</strong>
<ul style='margin: 0rem !important;'><li style='margin:0.5rem 0 !important;'>Auto-calculates valuation charges as per bank-specific slabs</li><li style='margin:0.5rem 0 !important;'>Create, edit & manage invoices</li><li style='margin:0.5rem 0 !important;'>Save and organize client details</li><li style='margin:0.5rem 0 !important;'>Manage bank-wise charge settings</li><li style='margin:0.5rem 0 !important;'>Track and access old invoices</li><li style='margin:0.5rem 0 !important;'>Quick dashboard for instant insights</li><li style='margin:0.5rem 0 !important;'>And much more...</li></ul>
💡 <strong>Why Choose This Tool?</strong>
<ul style='margin: 0rem !important;'><li style='margin:0.5rem 0 !important;'>✅ Fully customizable as per your business needs</li><li style='margin:0.5rem 0 !important;'>✅ 100% secure – installed directly on your server space</li><li style='margin:0.5rem 0 !important;'>✅ Cost-effective and easy to use</li><li style='margin:0.5rem 0 !important;'>✅ Freely call us for demo or on-site presentation</li></ul>\

🎥 <strong>Watch Demo Video:</strong>

See the tool in action: https://youtu.be/N3tnxczh54g<br>The tool is fully tested, ready to deploy, and built to save your time and reduce manual effort.

📞 Get in Touch:

Mobile: <strong>+91 90998 21601</strong> (WhatsApp available – just send Hi)
Email: s.shailesh909982@gmail.com
📍 Address: 1417, Excellent Business Hub, Near Gotala Vadi, Katargam Darwaja, Surat

I’d be happy to give you a free live demo – either online or at your preferred location.
Let me know when it's convenient!

Looking forward to connecting with you.

Warm regards,
Shailesh Sakariya
Chief Technical Officer`,
  subject: 'Introducing Our Property Valuation Tool - Save Time & Effort',
}

const validateRequest = (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      'Validation failed',
      true,
      errors.array(),
    )
  }
  next()
}

router.get('/health', (req, res) => {
  res.status(StatusCodes.OK).json({
    status: 'success',
    message: 'API is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  })
})

router.get('/accounts', async (req, res, next) => {
  try {
    const accounts = emailController.getAccounts()
    res.status(StatusCodes.OK).json({
      status: 'success',
      data: { accounts, total: accounts.length },
    })
  } catch (error) {
    next(error)
  }
})

router.post(
  '/send',
  [
    body('to').isEmail().withMessage('Valid recipient email is required'),
    body('subject')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('Subject is required'),
    body('body')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('Email body is required'),
    body('accountId').optional().isString().trim(),
    body('replyTo')
      .optional()
      .isEmail()
      .withMessage('Invalid reply-to email address'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { to, subject, body, accountId, replyTo } = req.body
      const emailContent = { subject, body, replyTo }
      const result = await emailController.sendEmail(
        to,
        emailContent,
        accountId,
      )

      res.status(StatusCodes.OK).json({
        status: 'success',
        data: result,
      })
    } catch (error) {
      next(error)
    }
  },
)

router.post(
  '/send-marketing-emails',
  [
    body('recipients')
      .isArray({ min: 1 })
      .withMessage('Recipients must be a non-empty array'),
    body('recipients.*.email')
      .isEmail()
      .withMessage('Valid email required for each recipient'),
    body('recipients.*.name')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('Name required for each recipient'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { recipients } = req.body
      const results = []

      for (const recipient of recipients) {
        const personalizedContent = {
          ...emailTemplate,
          subject: emailTemplate.subject,
          text: emailTemplate.text.replace('{recipientName}', recipient.name),
          html: emailTemplate.text
            .replace('{recipientName}', recipient.name)
            .replace(/\n/g, '<br>')
            .replace(/🔧/g, '<strong>🔧</strong>')
            .replace(/💡/g, '<strong>💡</strong>')
            .replace(/✅/g, '<strong>✅</strong>')
            .replace(/🎥/g, '<strong>🎥</strong>')
            .replace(/📞/g, '<strong>📞</strong>')
            .replace(/📍/g, '<strong>📍</strong>'),
          replyTo: 's.shailesh909982@gmail.com',
        }

        const result = await emailController.sendEmail(
          recipient.email,
          personalizedContent,
        )
        results.push({
          email: recipient.email,
          name: recipient.name,
          success: result.success,
          messageId: result.messageId,
          sentAt: result.sentAt,
        })
      }

      res.status(StatusCodes.OK).json({
        status: 'success',
        message: 'Emails processed successfully',
        results,
      })
    } catch (error) {
      next(error)
    }
  },
)

router.get(
  '/accounts/:accountId/status',
  [
    param('accountId')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('Account ID is required'),
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { accountId } = req.params
      const accounts = emailController.getAccounts()
      const account = accounts.find((acc) => acc.id === accountId)

      if (!account) {
        throw new ApiError(
          StatusCodes.NOT_FOUND,
          `Account with ID ${accountId} not found`,
        )
      }

      res.status(StatusCodes.OK).json({
        status: 'success',
        data: account,
      })
    } catch (error) {
      next(error)
    }
  },
)

// Error handling middleware
router.use((err, req, res, next) => {
  logger.error(`API Error: ${err.message}`, {
    url: req.originalUrl,
    method: req.method,
    body: req.body,
  })

  const statusCode = err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR
  const message =
    err.isOperational !== false ? err.message : 'An unexpected error occurred'

  res.status(statusCode).json({
    status: 'error',
    message,
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
      details: err.details,
    }),
  })
})

module.exports = router
