-- Seller verification: admins can mark a farmer as verified.
ALTER TABLE farmers
  ADD COLUMN IF NOT EXISTS verified_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_note TEXT;
