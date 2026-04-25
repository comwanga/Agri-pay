-- Add on-chain Bitcoin address to seller profiles.
-- Sellers can receive on-chain BTC from buyers who prefer it.
-- This field is informational only — platform checkout is Lightning-first.
ALTER TABLE farmers
    ADD COLUMN IF NOT EXISTS btc_address TEXT;
