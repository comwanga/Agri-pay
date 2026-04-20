-- SokoPay v2 initial schema (PostgreSQL)

-- ── Users (admin / operator accounts) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('admin', 'operator', 'farmer')),
    farmer_id     UUID,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Farmers ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS farmers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    phone       TEXT NOT NULL UNIQUE,
    cooperative TEXT NOT NULL DEFAULT '',
    pin_hash    TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Balances (one row per farmer) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS balances (
    farmer_id      UUID PRIMARY KEY REFERENCES farmers(id) ON DELETE CASCADE,
    available_sats BIGINT NOT NULL DEFAULT 0 CHECK (available_sats >= 0),
    locked_sats    BIGINT NOT NULL DEFAULT 0 CHECK (locked_sats >= 0),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Payments ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farmer_id           UUID NOT NULL REFERENCES farmers(id),
    btcpay_invoice_id   TEXT,
    btcpay_payment_url  TEXT,
    amount_sats         BIGINT NOT NULL,
    amount_kes          NUMERIC(18,4) NOT NULL,
    rate_used           NUMERIC(18,4) NOT NULL,
    status              TEXT NOT NULL DEFAULT 'created'
                            CHECK (status IN (
                                'created',
                                'invoice_created',
                                'bitcoin_received',
                                'credited_to_farmer',
                                'cash_out_requested',
                                'disbursing_mpesa',
                                'completed',
                                'failed'
                            )),
    failure_reason      TEXT,
    crop_type           TEXT,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Payment events ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id  UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    event_type  TEXT NOT NULL,
    data        JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Withdrawals ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS withdrawals (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farmer_id         UUID NOT NULL REFERENCES farmers(id),
    amount_sats       BIGINT NOT NULL,
    amount_kes        NUMERIC(18,4) NOT NULL,
    rate_used         NUMERIC(18,4) NOT NULL,
    mpesa_ref         TEXT,
    mpesa_request_id  TEXT,
    status            TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN (
                              'pending',
                              'processing',
                              'disbursing_mpesa',
                              'completed',
                              'failed'
                          )),
    failure_reason    TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Orders ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farmer_id           UUID NOT NULL REFERENCES farmers(id),
    crop_type           TEXT NOT NULL,
    quantity_kg         NUMERIC(12,3) NOT NULL CHECK (quantity_kg > 0),
    price_per_kg_sats   BIGINT NOT NULL CHECK (price_per_kg_sats > 0),
    status              TEXT NOT NULL DEFAULT 'open'
                            CHECK (status IN ('open', 'filled', 'cancelled')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Exchange rate cache ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_cache (
    id          SERIAL PRIMARY KEY,
    btc_kes     NUMERIC(18,4) NOT NULL,
    btc_usd     NUMERIC(18,4) NOT NULL,
    fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_payments_farmer_id    ON payments(farmer_id);
CREATE INDEX IF NOT EXISTS idx_payments_status       ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at   ON payments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_events_pid    ON payment_events(payment_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_farmer_id ON withdrawals(farmer_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status    ON withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_orders_farmer_id      ON orders(farmer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status         ON orders(status);
CREATE INDEX IF NOT EXISTS idx_rate_cache_fetched_at ON rate_cache(fetched_at DESC);

-- ── Auto-update updated_at trigger ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER payments_set_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER withdrawals_set_updated_at
    BEFORE UPDATE ON withdrawals
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER orders_set_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER balances_set_updated_at
    BEFORE UPDATE ON balances
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
