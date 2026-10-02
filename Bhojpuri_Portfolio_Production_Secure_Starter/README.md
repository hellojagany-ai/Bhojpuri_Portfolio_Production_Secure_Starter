# Bhojpuri Portfolio — Production Backend Starter

This is the production-oriented upgrade of the portfolio.

## Included
- Express server
- SQLite metadata database
- Protected admin login using bcrypt + JWT in HttpOnly cookie
- Helmet security headers
- Rate limiting
- Server-side upload validation
- 8 MB upload limit
- PNG/JPEG/WEBP validation
- Owner-only project creation/deletion
- Editable WhatsApp/email settings API
- AI integration point kept server-side (no API key in frontend)
- The five supplied portfolio images only

## Run
1. Install Node.js 20+.
2. Copy `.env.example` to `.env`.
3. Generate a bcrypt password hash and set `ADMIN_PASSWORD_HASH`.
4. Set `ADMIN_USERNAME` and a long random `SESSION_SECRET`.
5. Run `npm install`.
6. Run `npm start`.
7. Open the displayed localhost URL.

## Important production deployment
For a public deployment, use HTTPS and a real managed/private object-storage service (S3-compatible or equivalent) rather than relying on local disk for uploads. Put the database behind proper backups. Restrict server filesystem permissions, rotate secrets, and configure a production domain.

The portfolio images are intentionally owner-supplied only. No AI-generated portfolio artwork is included.
