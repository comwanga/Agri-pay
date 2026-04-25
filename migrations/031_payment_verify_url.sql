-- LUD-21 verify URL for auto-settlement detection.
-- Populated when the seller's LNURL endpoint returns a `verify` field.
-- A background worker polls these URLs to detect payment without BTCPay.
ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS verify_url TEXT;
