const fs = require('fs').promises
const path = require('path')
const { createReadStream } = require('fs')
const { parse } = require('csv-parse')
const readline = require('readline')
const logger = require('../utils/logger')
const { ApiError } = require('../middleware/errorHandler')
const { StatusCodes } = require('http-status-codes')

// Supported file types and their MIME types
const SUPPORTED_TYPES = {
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/vnd.ms-excel': 'csv',
  'application/csv': 'csv',
}

// Maximum file size (5MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024

/**
 * Process an uploaded file and extract email content
 * @param {Object} file - Multer file object
 * @returns {Promise<Object>} Processed email content
 */
const processFile = async (file) => {
  try {
    // Validate file
    await validateFile(file)

    const filePath = path.join(__dirname, '../uploads', file.filename)
    const fileExtension = path
      .extname(file.originalname)
      .toLowerCase()
      .substring(1)

    let result

    // Process based on file type
    switch (fileExtension) {
      case 'txt':
        result = await processTextFile(filePath)
        break
      case 'csv':
        result = await processCsvFile(filePath)
        break
      default:
        throw new ApiError(
          StatusCodes.UNSUPPORTED_MEDIA_TYPE,
          `Unsupported file type: ${fileExtension}`,
        )
    }

    // Clean up the uploaded file after processing
    try {
      await fs.unlink(filePath)
    } catch (cleanupError) {
      logger.warn(`Failed to delete temporary file: ${cleanupError.message}`)
    }

    return result
  } catch (error) {
    logger.error(`File processing failed: ${error.message}`, error)
    throw error
  }
}

/**
 * Process a text file to extract email content
 * @param {string} filePath - Path to the text file
 * @returns {Promise<Object>} Processed email content
 */
const processTextFile = async (filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf8')

    // Extract content parts
    const subject = extractSubject(content)
    const body = extractBody(content, subject)
    const variables = extractVariables(content)

    return {
      subject,
      body,
      variables,
      type: 'text/plain',
    }
  } catch (error) {
    throw new ApiError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      `Failed to process text file: ${error.message}`,
    )
  }
}

/**
 * Process a CSV file to extract email content and recipient data
 * @param {string} filePath - Path to the CSV file
 * @returns {Promise<Object>} Processed email content and recipient data
 */
const processCsvFile = (filePath) => {
  return new Promise((resolve, reject) => {
    const results = {
      header: [],
      recipients: [],
      variables: new Set(),
    }

    const parser = parse({
      delimiter: ',',
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    })

    // Read file stream
    const stream = createReadStream(filePath)
      .pipe(parser)
      .on('data', (data) => {
        results.recipients.push(data)

        // Collect all unique variable names from CSV columns
        Object.keys(data).forEach((key) => {
          if (key.trim() !== '') {
            results.variables.add(key.trim())
          }
        })
      })
      .on('end', () => {
        if (results.recipients.length === 0) {
          return reject(
            new ApiError(
              StatusCodes.BAD_REQUEST,
              'CSV file is empty or invalid',
            ),
          )
        }

        resolve({
          ...results,
          variables: Array.from(results.variables),
          type: 'text/csv',
          totalRecipients: results.recipients.length,
        })
      })
      .on('error', (error) => {
        reject(
          new ApiError(
            StatusCodes.BAD_REQUEST,
            `Failed to parse CSV file: ${error.message}`,
          ),
        )
      })
  })
}

/**
 * Extract subject from text content
 * @param {string} text - Text content
 * @returns {string} Extracted subject
 */
const extractSubject = (text) => {
  // Look for [Subject: ...] or Subject: ... on first line
  const subjectMatch = text.match(
    /^(?:\[Subject:\s*([^\]]+)\]|Subject:\s*(.+))\r?\n/i,
  )
  return subjectMatch
    ? (subjectMatch[1] || subjectMatch[2]).trim()
    : 'No Subject'
}

/**
 * Extract body from text content
 * @param {string} text - Text content
 * @param {string} subject - Extracted subject
 * @returns {string} Extracted body
 */
const extractBody = (text, subject) => {
  // Remove subject line and trim
  let body = text
    .replace(/^(?:\[Subject:[^\]]+\]|Subject:[^\n]+)\r?\n?/i, '')
    .trim()

  // Remove any metadata sections like [VARIABLES]...
  body = body.replace(/\[\w+\][\s\S]*?(?=\n\n|\r\n\r\n|$)/g, '').trim()

  return body || 'No content'
}

/**
 * Extract template variables from text content
 * @param {string} text - Text content
 * @returns {string[]} Array of unique variable names
 */
const extractVariables = (text) => {
  // Match {{variable}} patterns
  const varMatches = text.match(/\{\{\s*([^}]+)\s*\}\}/g) || []

  // Extract variable names and remove duplicates
  const variables = new Set()
  varMatches.forEach((match) => {
    const varName = match.replace(/[{}]/g, '').trim()
    if (varName) {
      variables.add(varName)
    }
  })

  return Array.from(variables)
}

/**
 * Validate the uploaded file
 * @param {Object} file - Multer file object
 * @throws {ApiError} If file is invalid
 */
const validateFile = async (file) => {
  if (!file) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'No file uploaded')
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    throw new ApiError(
      StatusCodes.PAYLOAD_TOO_LARGE,
      `File size (${(file.size / 1024 / 1024).toFixed(
        2,
      )}MB) exceeds maximum allowed (5MB)`,
    )
  }

  // Check file type
  const fileExtension = path
    .extname(file.originalname)
    .toLowerCase()
    .substring(1)
  const mimeType = Object.keys(SUPPORTED_TYPES).find(
    (key) => SUPPORTED_TYPES[key] === fileExtension,
  )

  if (!mimeType) {
    throw new ApiError(
      StatusCodes.UNSUPPORTED_MEDIA_TYPE,
      `Unsupported file type: ${fileExtension}. Supported types: ${Object.values(
        SUPPORTED_TYPES,
      ).join(', ')}`,
    )
  }

  // Verify file exists and is readable
  try {
    await fs.access(file.path, fs.constants.R_OK)
  } catch (error) {
    throw new ApiError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      `File is not accessible: ${error.message}`,
    )
  }
}

/**
 * Read a file line by line
 * @param {string} filePath - Path to the file
 * @param {Function} lineCallback - Callback for each line
 * @returns {Promise<void>}
 */
const readFileByLine = async (filePath, lineCallback) => {
  const fileStream = createReadStream(filePath, { encoding: 'utf8' })

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  })

  for await (const line of rl) {
    await lineCallback(line)
  }
}

module.exports = {
  processFile,
  processTextFile,
  processCsvFile,
  extractSubject,
  extractBody,
  extractVariables,
  validateFile,
}
