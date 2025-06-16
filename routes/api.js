const express = require('express')
const multer = require('multer')
const { body, param, validationResult } = require('express-validator')
const { StatusCodes } = require('http-status-codes')
const emailController = require('../controllers/emailController')
const fileController = require('../controllers/fileController')
const { ApiError } = require('../middleware/errorHandler')
const logger = require('../utils/logger')

const router = express.Router()

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'text/plain',
      'text/csv',
      'application/vnd.ms-excel',
      'application/csv',
    ]
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(
        new ApiError(
          StatusCodes.UNSUPPORTED_MEDIA_TYPE,
          'Only .txt and .csv files are allowed',
        ),
      )
    }
  },
})
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

// Middleware to validate request
const validateRequest = (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      status: 'error',
      message: 'Validation failed',
      errors: errors.array(),
    })
  }
  next()
}

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health check endpoint
 *     description: Check if the API is running
 *     responses:
 *       200:
 *         description: API is healthy
 */
router.get('/health', (req, res) => {
  res.status(StatusCodes.OK).json({
    status: 'success',
    message: 'API is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  })
})

/**
 * @swagger
 * /api/accounts:
 *   get:
 *     summary: Get all email accounts
 *     description: Retrieve a list of all configured email accounts with their status
 *     responses:
 *       200:
 *         description: List of email accounts
 */
router.get('/accounts', async (req, res, next) => {
  try {
    const accounts = emailController.getAccounts()
    res.status(StatusCodes.OK).json({
      status: 'success',
      data: {
        accounts,
        total: accounts.length,
      },
    })
  } catch (error) {
    next(error)
  }
})

/**
 * @swagger
 * /api/send:
 *   post:
 *     summary: Send an email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - to
 *               - subject
 *               - body
 *             properties:
 *               to:
 *                 type: string
 *                 description: Recipient email address(es), comma-separated for multiple
 *               subject:
 *                 type: string
 *                 description: Email subject
 *               body:
 *                 type: string
 *                 description: Email body content
 *               accountId:
 *                 type: string
 *                 description: Optional specific account ID to use
 *               replyTo:
 *                 type: string
 *                 description: Reply-to email address
 *     responses:
 *       200:
 *         description: Email sent successfully
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Internal server error
 */
router.post(
  '/send',
  [
    body('to')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('Recipient email is required'),
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

      const emailContent = { subject, body }
      if (replyTo) {
        emailContent.replyTo = replyTo
      }

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

/**
 * @swagger
 * /api/send/batch:
 *   post:
 *     summary: Send batch emails
 *     consumes:
 *       - multipart/form-data
 *     parameters:
 *       - in: formData
 *         name: file
 *         type: file
 *         description: CSV file with email data
 *         required: true
 *       - in: formData
 *         name: subject
 *         type: string
 *         description: Email subject (can use {{variable}} for templating)
 *         required: true
 *       - in: formData
 *         name: body
 *         type: string
 *         description: Email body (can use {{variable}} for templating)
 *         required: true
 *       - in: formData
 *         name: accountId
 *         type: string
 *         description: Optional specific account ID to use
 *     responses:
 *       200:
 *         description: Batch email processing started
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Internal server error
 */
router.post(
  '/send/batch',
  upload.single('file'),
  [
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
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      if (!req.file) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'No file uploaded')
      }

      const { subject, body, accountId } = req.body

      // Process the uploaded file
      const fileData = await fileController.processFile(req.file)

      // For CSV files, we'll process each row as a separate email
      if (fileData.type === 'text/csv') {
        const results = []

        // Process each recipient in the CSV
        for (const recipient of fileData.recipients) {
          try {
            // Replace template variables in subject and body
            let processedSubject = subject
            let processedBody = body

            Object.entries(recipient).forEach(([key, value]) => {
              const placeholder = new RegExp(`\\{\\s*${key}\\s*\\}`, 'g')
              processedSubject = processedSubject.replace(placeholder, value)
              processedBody = processedBody.replace(placeholder, value)
            })

            // Send individual email
            const result = await emailController.sendEmail(
              recipient.email || recipient.to,
              { subject: processedSubject, body: processedBody },
              accountId,
            )

            results.push({
              recipient,
              status: 'success',
              messageId: result.messageId,
            })
          } catch (error) {
            results.push({
              recipient,
              status: 'error',
              error: error.message,
            })
          }
        }

        return res.status(StatusCodes.OK).json({
          status: 'success',
          data: {
            total: results.length,
            success: results.filter((r) => r.status === 'success').length,
            failed: results.filter((r) => r.status === 'error').length,
            results,
          },
        })
      }

      // For text files, send as a single email
      const result = await emailController.sendEmail(
        req.body.to,
        { subject: fileData.subject || subject, body: fileData.body },
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
/**
 * @swagger
 * /api/send-marketing-emails:
 *   post:
 *     summary: Send marketing emails to multiple recipients
 *     description: Send marketing emails to multiple recipients with optional attachment
 *     consumes:
 *       - multipart/form-data
 *     parameters:
 *       - in: formData
 *         name: file
 *         type: file
 *         description: Attachment file (optional)
 *         required: false
 *       - in: formData
 *         name: recipients
 *         type: array
 *         description: List of recipients with email and name
 *         required: true
 *         items:
 *           type: object
 *           properties:
 *             email:
 *               type: string
 *               description: Recipient email address
 *             name:
 *               type: string
 *               description: Recipient name
 *     responses:
 *       200:
 *         description: Marketing emails sent successfully
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Internal server error
 */

router.post(
  '/send-marketing-emails',
  upload.single('attachment'),
  async (req, res) => {
    try {
      // Validate request body
      const { recipients } = req.body
      if (
        !recipients ||
        !Array.isArray(recipients) ||
        recipients.length === 0
      ) {
        throw new ApiError(
          StatusCodes.BAD_REQUEST,
          'Recipients list is required and must be a non-empty array',
        )
      }

      // Validate recipient format
      const validRecipients = recipients.map((r) => {
        if (
          !r.email ||
          !r.name ||
          typeof r.email !== 'string' ||
          typeof r.name !== 'string'
        ) {
          throw new ApiError(
            StatusCodes.BAD_REQUEST,
            'Each recipient must have a valid email and name',
          )
        }
        return { email: r.email.trim(), name: r.name.trim() }
      })

      // Prepare attachment (if uploaded)
      let attachments = []
      if (req.file) {
        attachments = [
          {
            filename: req.file.originalname,
            path: path.join(__dirname, 'uploads', req.file.filename),
          },
        ]
      }

      // Send emails to each recipient
      const results = []
      for (const recipient of validRecipients) {
        const personalizedContent = {
          ...emailTemplate,
          subject: 'Simplify Calculate Property Valuation Charges – Smart Tool',
          text: emailTemplate.text.replace('{recipientName}', recipient.name),
          html: emailTemplate.text
            .replace('{recipientName}', recipient.name)
            .replace(/\n/g, '<br>') // Convert newlines to HTML breaks
            .replace(/🔧/g, '<strong>🔧</strong>')
            .replace(/💡/g, '<strong>💡</strong>')
            .replace(/✅/g, '<strong>✅</strong>')
            .replace(/🎥/g, '<strong>🎥</strong>')
            .replace(/📞/g, '<strong>📞</strong>')
            .replace(/📍/g, '<strong>📍</strong>'),
          replyTo: 's.shailesh909982@gmail.com',
          attachments,
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

      // Clean up uploaded file
      if (req.file) {
        await fs.unlink(path.join(__dirname, 'uploads', req.file.filename))
      }

      res.status(StatusCodes.OK).json({
        message: 'Emails processed successfully',
        results,
      })
    } catch (error) {
      logger.error('Error in send-marketing-emails:', error)
      res.status(error.statusCode || StatusCodes.INTERNAL_SERVER_ERROR).json({
        error: error.message,
      })
    }
  },
)
/**
 * @swagger
 * /api/accounts/{accountId}/status:
 *   get:
 *     summary: Get account status and usage
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the email account
 *     responses:
 *       200:
 *         description: Account status retrieved successfully
 *       404:
 *         description: Account not found
 */
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

// 404 handler for API routes
router.use((req, res, next) => {
  next(new ApiError(StatusCodes.NOT_FOUND, 'API endpoint not found'))
})

// Error handling middleware for API routes
router.use((err, req, res, next) => {
  logger.error(`API Error: ${err.message}`, {
    url: req.originalUrl,
    method: req.method,
    body: req.body,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  })

  // Handle Joi validation errors
  if (err.isJoi) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      status: 'error',
      message: 'Validation error',
      errors: err.details.map((detail) => ({
        message: detail.message,
        path: detail.path,
        type: detail.type,
      })),
    })
  }

  // Handle multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(StatusCodes.PAYLOAD_TOO_LARGE).json({
      status: 'error',
      message: 'File size is too large. Maximum allowed size is 5MB',
    })
  }

  // Handle other errors
  const statusCode = err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR
  const message =
    err.isOperational !== false ? err.message : 'An unexpected error occurred'

  res.status(statusCode).json({
    status: 'error',
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  })
})

module.exports = router
