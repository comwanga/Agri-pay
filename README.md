# SokoPay

A global Lightning marketplace — buy and sell anything, pay instantly with Bitcoin Lightning. No bank account, no KYC, no passwords. Your Nostr key is your identity.

Built to run as a Fedi mini-app. Open it inside Fedi and you're signed in automatically.

---

## What it does

**For buyers**
- Browse products across 11 categories, filtered by country and price
- Pay with Bitcoin Lightning — the invoice goes directly to the seller's wallet
- Prices shown in USD by default, toggle to local currency any time
- Scan a QR code or tap "Pay with Fedi / WebLN" for one-tap checkout
- If your wallet supports LUD-21, the order updates itself automatically when you pay — no preimage paste needed

**For sellers**
- List products with photos, set your price (stored in KES, displayed in USD)
- Add your Lightning Address (`you@wallet.com`) or LNURL (`lnurl1dp68…`) to receive payments
- Optionally add an on-chain Bitcoin address for buyers who prefer it
- Funds go straight to your wallet — SokoPay never holds them

**For everyone**
- Sign in with Fedi (instant), a Nostr browser extension (Alby, nos2x), paste your nsec from Primal/Damus, or generate a fresh identity in 5 seconds
- Rate sellers and products after delivery
- File a dispute if something goes wrong — admin team reviews and resolves

**Coming soon**
- Escrow protection — funds held until you confirm delivery

---

## How payments work

SokoPay is **non-custodial**. Payments go directly from the buyer's wallet to the seller's.

1. Buyer taps "Pay with Lightning"
2. Backend calls the seller's Lightning Address or LNURL to fetch a real BOLT11 invoice
3. Buyer scans the QR or pays with one tap via WebLN / Fedi
4. If the seller's wallet supports **LUD-21 verify**, a background worker polls for settlement every 10 seconds and advances the order automatically
5. Without LUD-21, the buyer's WebLN wallet returns a preimage automatically (Fedi users), or they paste it manually from their wallet's payment details

The platform never touches the money.

---

## Sign-in options

| Option | When to use |
|--------|------------|
| **Fedi app** | Open SokoPay inside Fedi — signs in with zero steps |
| **Nostr extension** | Alby, nos2x, Flamingo in your browser |
| **Paste nsec** | You have a key from Primal, Damus, Iris, or Amethyst |
| **Generate new** | First time — creates a keypair in your browser in 5 seconds |

Your private key never leaves your device.

---

## Stack

**Backend** — Rust + Axum + PostgreSQL. Handles auth, products, orders, Lightning invoices, background workers, and a Prometheus metrics endpoint.

**Frontend** — React 18 + TypeScript + Tailwind CSS + Vite. Global marketplace UI with editorial homepage, product rows, cart, and mobile bottom nav.

**Payments** — Lightning Network via seller's own Lightning Address / LNURL (LUD-16 / LUD-01). Auto-settlement via LUD-21 verify URL polling. No BTCPay Server required.

**Identity** — Nostr NIP-98 HTTP Auth. The frontend signs a kind-27235 event and exchanges it for a JWT. No passwords.

| Layer | Technology |
|-------|-----------|
| API server | Rust, Axum, Tokio |
| Database | PostgreSQL 16, sqlx |
| Auth | Nostr NIP-98, Schnorr signatures, JWT |
| Lightning | Seller's own wallet via LNURL-pay (LUD-16/01/21) |
| FX rates | CoinGecko API with 60-second DB cache |
| Frontend | React 18, TypeScript 5, Tailwind 3, Vite 6 |
| State | TanStack Query 5, React Context |
| Deployment | Docker Compose (local), GitHub Pages (frontend) |

---

## Getting started

### 1. Clone

```bash
git clone https://github.com/comwanga/SokoPay.git
cd SokoPay
```

### 2. Set up your environment

```bash
cp .env.example .env
```

Minimum required:

```env
DATABASE_URL=postgresql://sokopay:sokopay_dev@localhost:5433/sokopay?sslmode=disable
JWT_SECRET=<openssl rand -base64 48>
```

That's enough to run locally. No external payment services needed.

### 3. Start Postgres

```bash
docker compose up postgres -d
```

Migrations run automatically when the backend starts.

### 4. Run the backend

```bash
cargo run
```

API available at `http://localhost:3001`.

### 5. Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend at `http://localhost:5173`.

---

## How sellers get paid

Sellers add a Lightning Address or LNURL to their profile:

- **Lightning Address** — an email-style address like `you@walletofsatoshi.com` or `you@getalby.com`
- **LNURL** — a `lnurl1dp68…` string from Fedi or any other wallet that doesn't use email-style addresses. In Fedi: **Wallet → Receive → LNURL → Copy**
- **On-chain Bitcoin** — optional, for buyers who prefer on-chain BTC

When a buyer pays, the money lands directly in the seller's wallet. No withdrawal step needed.

---

## Deployment

### Frontend (GitHub Pages)

Deploys automatically on every push to `main`. Live at [comwanga.github.io/SokoPay](https://comwanga.github.io/SokoPay/).

To connect to a real backend:
1. Deploy the Rust API to any server (Railway, Fly.io, a VPS)
2. Set `VITE_API_URL` to your backend URL in GitHub Actions variables
3. Re-run the deploy workflow

### Full stack (Docker)

```bash
cp .env.example .env
# fill in production values
docker compose up --build -d
```

Services: `postgres` on 5433, `backend` on 3001.

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | At least 32 characters. Signs all tokens |
| `JWT_EXPIRY_HOURS` | No (default: 24) | How long tokens last |
| `ADMIN_PASSWORD_HASH` | No | bcrypt hash for admin login |
| `PUBLIC_BASE_URL` | No (default: localhost) | Publicly reachable backend URL |
| `ALLOWED_ORIGINS` | No (default: localhost) | Comma-separated CORS origins |
| `UPLOAD_DIR` | No (default: ./uploads) | Where product images are stored |
| `COINGECKO_API_URL` | No | FX oracle base URL |
| `RATE_CACHE_SECONDS` | No (default: 60) | How long to cache BTC/USD/KES rates |
| `LOG_FORMAT` | No (default: text) | `text` for dev, `json` for production |
| `NOSTR_RELAY_URL` | No | Relay for order-status DM notifications |

---

## API

All endpoints are under `/api`. Protected routes require `Authorization: Bearer <token>`.

### Auth

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/nostr` | Sign in with a NIP-98 signed event. Creates a profile on first use |
| `POST` | `/auth/login` | Username + password for admin accounts |
| `POST` | `/auth/refresh` | Refresh a JWT before it expires |

### Products

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/products` | List products. Filters: `category`, `country`, `sort`, `q`, `in_stock` |
| `POST` | `/products` | Create a listing |
| `GET` | `/products/:id` | Single product with images and ratings |
| `PUT` | `/products/:id` | Update your listing |
| `DELETE` | `/products/:id` | Remove your listing |
| `POST` | `/products/:id/images` | Upload an image (multipart) |

### Orders

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/orders` | Your orders (buyer or seller view) |
| `POST` | `/orders` | Place an order |
| `PATCH` | `/orders/:id/status` | Update order status |
| `DELETE` | `/orders/:id` | Cancel an order |
| `POST` | `/orders/:id/dispute` | Open a dispute |

### Payments

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/payments/invoice` | Generate a Lightning invoice for an order |
| `POST` | `/payments/confirm` | Confirm payment with a preimage |
| `GET` | `/payments/order/:id` | Payment status for an order |
| `GET` | `/payments/history` | Your payment history |
| `GET` | `/payments/verify-ln` | Check if a Lightning Address or LNURL is reachable |

### Sellers

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/farmers/:id` | Seller profile |
| `PUT` | `/farmers/:id` | Update your profile (name, Lightning Address, LNURL, Bitcoin address) |
| `GET` | `/storefront/:id` | Public seller page with listings |

### Lightning tips

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/lnurl/tip/:seller_id` | Get a tip invoice from a seller's Lightning wallet |

### Admin

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/disputes` | Open disputes |
| `PATCH` | `/admin/disputes/:id/resolve` | Resolve: `refund_buyer`, `release_seller`, or `split` |
| `POST` | `/farmers/:id/verify` | Verify a seller |

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
