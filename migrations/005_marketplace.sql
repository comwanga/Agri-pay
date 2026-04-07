-- AgriPay v3: Non-custodial P2P marketplace
-- Drop custodial tables and build new marketplace schema.

-- ── Drop old custodial tables (dependency order) ──────────────────────────────
DROP TABLE IF EXISTS payment_events;
DROP TABLE IF EXISTS withdrawals;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS balances;
DROP TABLE IF EXISTS orders;

-- ── Extend farmers with marketplace fields ────────────────────────────────────
ALTER TABLE farmers
    ADD COLUMN IF NOT EXISTS ln_address              TEXT,
    ADD COLUMN IF NOT EXISTS ln_address_verified_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS location_lat            DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS location_lng            DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS location_name           TEXT;

-- Phone is now optional (buyers registered via Nostr may not have one)
ALTER TABLE farmers ALTER COLUMN phone DROP NOT NULL;

-- ── Products ──────────────────────────────────────────────────────────────────
CREATE TABLE products (
    id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id      UUID          NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
    title          TEXT          NOT NULL,
    description    TEXT          NOT NULL DEFAULT '',
    price_kes      NUMERIC(12,2) NOT NULL CHECK (price_kes > 0),
    unit           TEXT          NOT NULL DEFAULT 'kg',
    quantity_avail NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (quantity_avail >= 0),
    category       TEXT          NOT NULL DEFAULT '',
    status         TEXT          NOT NULL DEFAULT 'active'
                                     CHECK (status IN ('active','paused','sold_out','deleted')),
    location_lat   DOUBLE PRECISION,
    location_lng   DOUBLE PRECISION,
    location_name  TEXT          NOT NULL DEFAULT '',
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── Product images ────────────────────────────────────────────────────────────
CREATE TABLE product_images (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id  UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    storage_key TEXT        NOT NULL,
    url         TEXT        NOT NULL,
    is_primary  BOOLEAN     NOT NULL DEFAULT false,
    sort_order  INT         NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Marketplace orders ────────────────────────────────────────────────────────
CREATE TABLE orders (
    id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id              UUID          NOT NULL REFERENCES products(id),
    seller_id               UUID          NOT NULL REFERENCES farmers(id),
    buyer_id                UUID          NOT NULL REFERENCES farmers(id),
    quantity                NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
    unit_price_kes          NUMERIC(12,2) NOT NULL,
    total_kes               NUMERIC(12,2) NOT NULL,
    total_sats              BIGINT,
    buyer_lat               DOUBLE PRECISION,
    buyer_lng               DOUBLE PRECISION,
    buyer_location_name     TEXT          NOT NULL DEFAULT '',
    distance_km             DOUBLE PRECISION,
    estimated_delivery_date DATE,
    seller_delivery_date    DATE,
    delivery_notes          TEXT,
    status                  TEXT          NOT NULL DEFAULT 'pending_payment'
                                              CHECK (status IN (
                                                  'pending_payment',
                                                  'paid',
                                                  'processing',
                                                  'in_transit',
                                                  'delivered',
                                                  'confirmed',
                                                  'disputed',
                                                  'cancelled'
                                              )),
    created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── Non-custodial payments (audit trail only — sats go direct to seller) ──────
CREATE TABLE payments (
    id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id     UUID          NOT NULL REFERENCES orders(id),
    bolt11       TEXT          NOT NULL,
    payment_hash TEXT          UNIQUE,           -- sha256(preimage), set at confirmation
    amount_sats  BIGINT        NOT NULL,
    amount_kes   NUMERIC(12,2) NOT NULL,
    rate_used    NUMERIC(18,4) NOT NULL,
    preimage     TEXT,                            -- proof of payment supplied by buyer
    status       TEXT          NOT NULL DEFAULT 'pending'
                                   CHECK (status IN ('pending','settled','expired')),
    settled_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── Order event log ───────────────────────────────────────────────────────────
CREATE TABLE order_events (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id   UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    actor_id   UUID        REFERENCES farmers(id),
    event_type TEXT        NOT NULL,
    notes      TEXT,
    metadata   JSONB       NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX idx_products_seller_id    ON products(seller_id);
CREATE INDEX idx_products_status       ON products(status);
CREATE INDEX idx_products_created_at   ON products(created_at DESC);
CREATE INDEX idx_product_images_pid    ON product_images(product_id);
CREATE INDEX idx_orders_product_id     ON orders(product_id);
CREATE INDEX idx_orders_seller_id      ON orders(seller_id);
CREATE INDEX idx_orders_buyer_id       ON orders(buyer_id);
CREATE INDEX idx_orders_status         ON orders(status);
CREATE INDEX idx_orders_created_at     ON orders(created_at DESC);
CREATE INDEX idx_payments_order_id     ON payments(order_id);
CREATE INDEX idx_order_events_order_id ON order_events(order_id);

-- ── Auto-update triggers ──────────────────────────────────────────────────────
-- set_updated_at() function was created in 001_initial.sql

CREATE OR REPLACE TRIGGER products_set_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER orders_set_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
