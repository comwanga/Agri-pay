-- Add Nostr public key to farmers for Fedi mini app authentication
ALTER TABLE farmers ADD COLUMN IF NOT EXISTS nostr_pubkey TEXT UNIQUE;
