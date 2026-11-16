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
- Gemini API calls execute strictly on the server (`/api/ai/ask`) grounded only in the authenticated user's current business & branch metrics.
