# BizTrade Africa

**Expand Your Business. Manage Everything.**

BizTrade Africa is an all-in-one business-management platform designed to help African businesses manage, grow, and expand their operations (RWF, `+250`, `Africa/Kigali`, configurable 18% VAT, English / Kinyarwanda / French UI, Cash / MTN Mobile Money / Airtel Money / Bank Transfer / Card).

---

## Core Architecture

- **Frontend (`src/`)**: React 19 (`.jsx`), Vite, Tailwind CSS v4, React Router DOM, Axios, Recharts, Lucide React, Socket.IO Client.
- **Backend (`server.ts`, `backend/`)**: Node.js + Express, Socket.IO (tenant-isolated rooms), JWT (`user_sessions` revocation), `bcryptjs`, `express-validator`, Multer (local `/uploads` storage), Helmet, `express-rate-limit`, Nodemailer, and server-side `@google/genai` (`gemini-4-hydrogen`) for the AI Business Assistant.
- **Database (`database/`, `backend/config/db.js`)**:
  - **MySQL 8+ (`mysql2/promise`)** when `DB_CLIENT=mysql` and MySQL host credentials are configured (`database/schema.sql`, `database/seed.sql`, `database/relationships.sql`).
  - **Embedded Persistent SQLite (`node:sqlite`)** fallback (`./data/bizflow.sqlite`) for instant zero-config local/container execution with ACID `BEGIN IMMEDIATE` transactions.

---

## Quick Start

### 1. Environment Configuration
Copy `.env.example` to `.env` and customize secrets/credentials:
```bash
cp .env.example .env
```

### 2. Install Dependencies
```bash
npm install
```

### 3. MySQL Setup (Optional for Production / External DB)
```bash
mysql -u root -p < database/schema.sql
mysql -u root -p biztrade_africa < database/seed.sql
```
Set `DB_CLIENT=mysql` and `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` in `.env`. If omitted or unreachable, BizTrade Africa automatically persists locally.

### 4. Run Development Server (Port 3000)
```bash
npm run dev
```

### 5. Build & Run Production
```bash
npm run build
npm start
```

---

## Security & Multi-Tenancy Guarantees

- Every business request requires `x-business-id` and validates membership in `business_members` (`requireBusiness`).
- Every protected operation checks role + per-member permission overrides (`requirePermission`).
- Stock mutations (`POST /api/sales`, `POST /api/inventory/adjust`, `POST /api/inventory/transfer`, `POST /api/purchases/:id/receive`, `POST /api/sales/:id/refund`) run inside ACID transactions with atomic conditional stock checks (`quantity >= ?`) and immutable `stock_movements` audit entries.
- Multi-channel registration OTP supports **Email SMTP**, **SMS** (Twilio / Africa's Talking), and **Meta WhatsApp Business Cloud API** with HMAC-SHA256 hashed 6-digit codes, 5-minute TTL, rate limits, attempt limits, and zero fake simulation.
- Gemini API calls execute strictly on the server (`/api/ai/ask`) grounded only in the authenticated user's current business & branch metrics.

---

## Production Deployment Checklist

1. **TLS / HTTPS & Reverse Proxy**: Terminate HTTPS at Nginx/Cloudflare and forward `X-Forwarded-For` and `X-Forwarded-Proto` to Node (`PORT=3000`). Set `NODE_ENV=production` and restrict `CORS_ORIGINS` to your production HTTPS origins.
2. **Database**: Configure `DB_CLIENT=mysql`, `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`, and load `/database/schema.sql` (`ensureMySqlSchemaAndIndexes` also enforces indexes and columns idempotently on startup). Schedule automated daily backups.
3. **Secrets**: Set a strong 64+ char `JWT_SECRET` and `OTP_SECRET` in `.env` (never commit `.env`).
4. **Email SMTP**: Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (Brevo, SendGrid, SES, or Gmail App Password).
5. **SMS OTP (Optional)**: Set `SMS_PROVIDER=twilio` (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`) or `SMS_PROVIDER=africastalking` (`AT_USERNAME`, `AT_API_KEY`, `AT_SENDER_ID`).
6. **WhatsApp Cloud API (Optional)**: Set `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, and an approved authentication template (`WHATSAPP_OTP_TEMPLATE_NAME`). Point Meta webhook to `https://<domain>/api/whatsapp/webhook`.
7. **Persistent Storage & Health**: Mount `/uploads` (and `/data` if using SQLite) on persistent volumes. Monitor `GET /api/health`.

