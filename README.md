# Email Sender Service

A robust, production-ready email sending service built with Node.js, Express, and Nodemailer. This service supports multiple email accounts, rate limiting, file uploads, and batch email sending.

## Features

- 🚀 Send individual and batch emails
- 🔄 Multiple email account support with load balancing
- ⚡ Rate limiting and account rotation
- 📎 File uploads (CSV, TXT)
- 📊 Email templates with variable substitution
- 🔒 Secure authentication and validation
- 📝 Comprehensive logging
- 🛡️ CORS and security headers
- 🧪 Unit and integration tests
- 📦 Docker support

## Prerequisites

- Node.js 14.x or higher
- npm or yarn
- MongoDB (for session storage, optional)
- Redis (for rate limiting, optional)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/email-sender.git
   cd email-sender
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   yarn
   ```

3. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

4. Update the `.env` file with your configuration.

5. Configure your email accounts in `config/accounts.json`.

## Configuration

### Email Accounts

Update `config/accounts.json` with your email accounts:

```json
{
  "accounts": [
    {
      "id": "gmail-account",
      "name": "My Gmail Account",
      "email": "your-email@gmail.com",
      "password": "your-app-password",
      "service": "gmail",
      "dailyLimit": 500
    },
    {
      "id": "outlook-account",
      "name": "My Outlook Account",
      "email": "your-email@outlook.com",
      "password": "your-password",
      "service": "outlook",
      "dailyLimit": 300
    }
  ]
}
```

> **Note:** For Gmail, you'll need to generate an "App Password" if you have 2FA enabled.

## API Endpoints

### Send Email

```http
POST /api/send
Content-Type: application/json

{
  "to": "recipient@example.com",
  "subject": "Hello, World!",
  "body": "This is a test email.",
  "accountId": "optional-account-id",
  "replyTo": "reply-to@example.com"
}
```

### Send Batch Emails (CSV)

```http
POST /api/send/batch
Content-Type: multipart/form-data

# Form Data:
# file: your-file.csv
# subject: Hello, {{name}}!
# body: Dear {{name}},
#        This is a test email for {{email}}.
# accountId: optional-account-id
```

### Get Email Accounts

```http
GET /api/accounts
```

### Get Account Status

```http
GET /api/accounts/:accountId/status
```

### Health Check

```http
GET /api/health
```

## Development

### Running Locally

```bash
# Start in development mode
npm run dev

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format
```

### Environment Variables

See `.env.example` for all available environment variables.

## Production Deployment

### Docker

```bash
# Build the Docker image
docker build -t email-sender .

# Run the container
docker run -d \
  --name email-sender \
  -p 3000:3000 \
  --env-file .env \
  email-sender
```

### PM2 (Recommended for Production)

```bash
# Install PM2 globally
npm install -g pm2

# Start the application
pm2 start app.js --name "email-sender"

# Save the process list
pm2 save

# Generate startup script
pm2 startup

# Monitor logs
pm2 logs email-sender
```

## Security

- Always use HTTPS in production
- Store sensitive data in environment variables
- Regularly rotate API keys and credentials
- Implement proper CORS policies
- Use rate limiting to prevent abuse
- Keep dependencies up to date

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a pull request

## Support

For support, please open an issue or contact the maintainers.
