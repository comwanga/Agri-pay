-- Escrow mode: when enabled, the platform holds payment until the buyer
-- confirms delivery before releasing funds to the seller.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS escrow_mode BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS escrow_mode BOOLEAN NOT NULL DEFAULT false;
