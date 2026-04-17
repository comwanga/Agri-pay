-- Phase 3 performance indexes for cursor pagination and query optimisation.
-- All created with IF NOT EXISTS so this migration is safe to re-run.

-- Supports keyset cursor pagination on the products listing page.
-- The partial index on status = 'active' matches the WHERE clause in list_products.
CREATE INDEX IF NOT EXISTS idx_products_cursor_active
    ON products (created_at DESC, id DESC)
    WHERE status = 'active';

-- Speeds up storefront queries: products for a specific seller.
CREATE INDEX IF NOT EXISTS idx_products_seller_active
    ON products (seller_id, created_at DESC)
    WHERE status = 'active';

-- Order messages: already created in migration 016, but add covering index
-- to avoid heap fetches for the thread query (SELECT id, sender_id, body, sent_at).
CREATE INDEX IF NOT EXISTS idx_order_messages_thread
    ON order_messages (order_id, sent_at ASC)
    INCLUDE (sender_id, body);

-- Disbursements admin dashboard: filter by status for pending/manual_required rows.
CREATE INDEX IF NOT EXISTS idx_disbursements_status_pending
    ON disbursements (status, initiated_at DESC)
    WHERE status IN ('pending', 'processing', 'manual_required');

-- Farmers soft-delete query: WHERE deleted_at IS NULL is very common.
CREATE INDEX IF NOT EXISTS idx_farmers_active
    ON farmers (id)
    WHERE deleted_at IS NULL;
