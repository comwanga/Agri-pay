# SokoPay

A marketplace for Africa — buy and sell anything, pay with Lightning or M-Pesa. No bank account needed, no KYC, no passwords. Identity runs on Nostr.

Built as a Fedi mini app so cooperative members sign in automatically. Payments settle in seconds via Lightning Network. Sellers cash out to M-Pesa on demand.

---

![SokoPay marketplace](https://github.com/user-attachments/assets/94f0dcef-ac4a-4c2b-9500-5bdd96274b87)

---

## What it does

- **Browse and buy** — product listings across 11 categories, filterable by country, price, rating, and stock
- **Sell anything** — list products with images, set your price in KES, choose Lightning or escrow payment
- **Pay your way** — Lightning Network for instant Bitcoin settlement, M-Pesa STK Push for local mobile money
- **Escrow protection** — opt-in escrow holds funds until the buyer confirms delivery
- **No accounts** — Nostr public key is your identity; open the app inside Fedi and you're in
- **Cash out any time** — sellers trigger M-Pesa B2C transfers from their balance whenever they want
- **Ratings and reviews** — buyers rate products and sellers after delivery
- **Dispute resolution** — buyers open disputes with evidence; admins resolve with refund, release, or split
- **Works globally** — 190+ countries in the shipping matrix, BTC/KES exchange rates updated every minute

---

## Stack

**Backend** — Rust + Axum + PostgreSQL. Handles auth, product listings, orders, payments, M-Pesa callbacks, Lightning invoices via BTCPay Server, background workers for invoice expiry and low-stock alerts, and a Prometheus metrics endpoint.

**Frontend** — React 18 + TypeScript + Tailwind CSS + Vite. Amazon-style UI: editorial homepage with curated product rows, category landing pages, dedicated cart with real checkout, and a slide-in mega menu.

**Payments** — Lightning Network via BTCPay Server (invoice lifecycle + webhook). M-Pesa via Safaricom Daraja (STK Push for buying, B2C for seller payouts).

**Identity** — Nostr NIP-98 HTTP Auth. The frontend signs a kind-27235 event and exchanges it for a JWT. No passwords anywhere.

| Layer | Technology |
|---|---|
| API server | Rust 1.75+, Axum 0.7, Tokio |
| Database | PostgreSQL 16, sqlx 0.8 |
| Auth | Nostr NIP-98, k256 Schnorr, jsonwebtoken |
| Lightning | BTCPay Server |
| Mobile money | Safaricom Daraja B2C |
| FX rates | CoinGecko API with DB cache |
| Frontend | React 18, TypeScript 5, Tailwind 3, Vite 6 |
| State | React Query 5, Context API |
| Deployment | Docker Compose (local), GitHub Pages (frontend) |

---

## Getting started

### 1. Clone

```bash
git clone https://github.com/comwanga/Agri-pay.git
cd Agri-pay
```

### 2. Set up your environment

```bash
cp .env.example .env
```

Minimum required in `.env`:

```env
DATABASE_URL=postgresql://agripay:agripay_dev@localhost:5433/agri_pay?sslmode=disable
JWT_SECRET=<openssl rand -base64 48>
```

For Lightning payments add:
```env
BTCPAY_URL=https://your-btcpay-instance
BTCPAY_API_KEY=your_api_key
BTCPAY_STORE_ID=your_store_id
BTCPAY_WEBHOOK_SECRET=<openssl rand -hex 32>
```

For M-Pesa add:
```env
MPESA_CONSUMER_KEY=...
MPESA_CONSUMER_SECRET=...
MPESA_SHORTCODE=...
MPESA_PASSKEY=...
MPESA_CALLBACK_URL=https://your-public-url/api/payments/mpesa/callback
```

### 3. Start Postgres

```bash
docker compose up postgres -d
```

Wait a few seconds for the health check. Migrations run automatically when the backend starts.

### 4. Run the backend

```bash
cargo run
```

API available at `http://localhost:3001`. Migrations apply on first start.

### 5. Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend at `http://localhost:5173`. For Nostr auth to work in production, open the GitHub Pages URL inside Fedi and point `VITE_API_URL` to a public backend.

---

## Deployment

### Frontend (GitHub Pages)

The frontend deploys automatically on every push to `main` via GitHub Actions. Live at [comwanga.github.io/Agri-pay](https://comwanga.github.io/Agri-pay/).

To connect to a backend:
1. Deploy the Rust API to any server (Railway, Fly.io, a VPS)
2. In GitHub repo settings → Variables → Actions, set `VITE_API_URL` to your backend URL
3. Re-run the deploy workflow

For local backend testing, use ngrok:
```bash
ngrok http 3001
# paste the HTTPS URL into VITE_API_URL in your .env, then npm run dev
```

### Full stack (Docker)

```bash
cp .env.example .env
# fill in production values
docker compose up --build -d
```

Services: `postgres` on 5433, `backend` on 3001, `frontend` dev server on 5173.

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | required | PostgreSQL connection string |
| `JWT_SECRET` | required | Min 32 chars. Signs all tokens |
| `JWT_EXPIRY_HOURS` | `24` | Token lifetime |
| `ADMIN_PASSWORD_HASH` | — | bcrypt hash for admin login. Leave blank to disable |
| `BTCPAY_URL` | — | BTCPay Server URL |
| `BTCPAY_API_KEY` | — | BTCPay API key |
| `BTCPAY_STORE_ID` | — | BTCPay store ID |
| `BTCPAY_WEBHOOK_SECRET` | — | HMAC secret for BTCPay webhooks |
| `MPESA_ENV` | `sandbox` | `sandbox` or `production` |
| `MPESA_CONSUMER_KEY` | — | Daraja consumer key |
| `MPESA_CONSUMER_SECRET` | — | Daraja consumer secret |
| `MPESA_SHORTCODE` | — | Business short code |
| `MPESA_PASSKEY` | — | STK Push passkey |
| `MPESA_CALLBACK_URL` | — | Public HTTPS URL for Daraja callbacks |
| `MPESA_B2C_INITIATOR_NAME` | — | B2C initiator username |
| `MPESA_B2C_SECURITY_CREDENTIAL` | — | RSA-encrypted initiator password |
| `MPESA_B2C_RESULT_URL` | — | B2C result callback URL |
| `MPESA_B2C_TIMEOUT_URL` | — | B2C timeout callback URL |
| `PUBLIC_BASE_URL` | `http://localhost:3001` | Publicly reachable backend URL |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | Comma-separated CORS origins |
| `UPLOAD_DIR` | `./uploads` | Where product images are stored |
| `COINGECKO_API_URL` | CoinGecko v3 | FX oracle base URL |
| `RATE_CACHE_SECONDS` | `60` | How long to cache BTC rates |
| `LOG_FORMAT` | `text` | `text` for dev, `json` for production |

---

## API

All endpoints are under `/api`. Protected routes require `Authorization: Bearer <token>`.

### Auth

| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/nostr` | Sign in with a Nostr NIP-98 signed event. Auto-creates a farmer profile on first use |
| `POST` | `/auth/login` | Username + password login for admin and operator accounts |
| `POST` | `/auth/register` | Create a user account (admin only) |
| `POST` | `/auth/refresh` | Refresh a JWT |

### Products

| Method | Path | Description |
|---|---|---|
| `GET` | `/products` | List products. Filters: `category`, `country`, `sort`, `q`, `in_stock`, `cursor` |
| `POST` | `/products` | Create a listing |
| `GET` | `/products/:id` | Single product with images and ratings |
| `PUT` | `/products/:id` | Update your listing |
| `DELETE` | `/products/:id` | Remove your listing |
| `POST` | `/products/:id/images` | Upload an image (multipart) |
| `GET` | `/products/:id/ratings` | Reviews for a product |
| `POST` | `/products/:id/ratings` | Leave a review |

### Orders

| Method | Path | Description |
|---|---|---|
| `GET` | `/orders` | Your orders (buyer or seller view depending on role) |
| `POST` | `/orders` | Place an order |
| `GET` | `/orders/:id` | Order details |
| `PATCH` | `/orders/:id/status` | Update order status |
| `DELETE` | `/orders/:id` | Cancel an order |
| `GET` | `/orders/:id/messages` | Message thread between buyer and seller |
| `POST` | `/orders/:id/messages` | Send a message |
| `POST` | `/orders/:id/dispute` | Open a dispute |

### Payments

| Method | Path | Description |
|---|---|---|
| `POST` | `/payments/invoice` | Create a Lightning invoice for an order |
| `POST` | `/payments/confirm` | Confirm Lightning payment with preimage |
| `GET` | `/payments/order/:id` | Payment status for an order |
| `GET` | `/payments/history` | Your payment history |
| `POST` | `/payments/mpesa/stk-push` | Initiate M-Pesa STK Push |
| `GET` | `/payments/mpesa/:id/status` | M-Pesa payment status |

### Sellers

| Method | Path | Description |
|---|---|---|
| `GET` | `/farmers/:id` | Seller profile |
| `PUT` | `/farmers/:id` | Update your profile |
| `GET` | `/farmers/:id/analytics` | Sales analytics (your own) |
| `GET` | `/farmers/:id/ratings` | Seller rating summary |
| `GET` | `/storefront/:id` | Public seller storefront |

### Admin

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/disputes` | Open disputes |
| `PATCH` | `/admin/disputes/:id/resolve` | Resolve a dispute: `refund_buyer`, `release_seller`, or `split` |
| `POST` | `/farmers/:id/verify` | Verify a seller |

---

## Payment flows

**Buying with Lightning**

Buyer places order → creates Lightning invoice → scans with any Lightning wallet → BTCPay webhook fires → order moves to `paid` → seller ships.

**Buying with M-Pesa**

Buyer places order → enters phone number → STK Push sent to phone → buyer approves on phone → Daraja callback confirms → order moves to `paid`.

**Escrow mode**

Seller opts in per listing. Funds held by the platform after payment. Released to seller only after buyer confirms delivery. Disputes can be raised if something goes wrong.

**Seller payout**

Seller goes to dashboard → triggers M-Pesa B2C transfer → Daraja sends funds to registered phone → balance updated on callback. Stuck transfers auto-recover after 30 minutes.

---

## Order status flow

```
pending_payment → paid → processing → in_transit → delivered → confirmed
                                                              └→ disputed → resolved
                       └→ cancelled
```

---

## Running tests

```bash
# Backend
cargo test

# Frontend type check
cd frontend && npx tsc --noEmit
```

---

## License

MIT
