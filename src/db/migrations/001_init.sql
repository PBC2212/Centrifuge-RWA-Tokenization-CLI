-- ============================================
-- Centrifuge RWA CLI — Initial DB Schema
-- ============================================
-- This migration sets up:
--   users, assets, loans (+ helpful indexes & constraints)
-- Designed to match your project’s workflow:
--   pledge-asset → deposit-collateral → borrow → repay/liquidate
-- ============================================

-- Extensions ---------------------------------------------------------------
-- gen_random_uuid() for UUID PKs
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enums -------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'asset_status') THEN
    CREATE TYPE asset_status AS ENUM ('pledged', 'collateralized', 'released');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'loan_status') THEN
    CREATE TYPE loan_status AS ENUM ('active', 'repaid', 'liquidated');
  END IF;
END$$;

-- Tables ------------------------------------------------------------------

-- Users: end-users of the CLI (wallet holders)
CREATE TABLE IF NOT EXISTS users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address      VARCHAR(42) NOT NULL UNIQUE,                        -- 0x... (EVM)
  encrypted_private_key TEXT,                                             -- optional: we generally store keys locally; leave NULL by default
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Assets: pledged/tokenized RWAs
CREATE TABLE IF NOT EXISTS assets (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  metadata_cid        TEXT NOT NULL,                                      -- IPFS/Filecoin CID
  token_address       VARCHAR(42),                                        -- ERC-20/1155/721/etc. representing RWA/pool share
  token_id            NUMERIC(78,0),                                      -- uint256-safe tokenId if applicable (ERC-721/1155); NULL for fungible
  valuation           NUMERIC(38, 2),                                     -- appraised fiat value (optional)
  status              asset_status NOT NULL DEFAULT 'pledged',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_asset_unique_token UNIQUE (token_address, token_id)
);

-- Loans: borrowing lifecycle against tokenized collateral
CREATE TABLE IF NOT EXISTS loans (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id            UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  vault_address       VARCHAR(42) NOT NULL,                               -- Centrifuge Vault (ERC-4626 / ERC-7540)
  amount              NUMERIC(38, 6) NOT NULL,                            -- principal (stablecoin)
  interest_rate       NUMERIC(9, 6) NOT NULL,                             -- decimal (e.g., 0.075000 = 7.5%)
  start_date          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_date            TIMESTAMPTZ NOT NULL,
  status              loan_status NOT NULL DEFAULT 'active',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Optional: Vault deposits (tracks deposits of RWA tokens into vaults)
CREATE TABLE IF NOT EXISTS vault_deposits (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id            UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  vault_address       VARCHAR(42) NOT NULL,
  shares              NUMERIC(78, 18),                                    -- vault shares received
  tx_hash             VARCHAR(100),                                       -- on-chain tx id
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Optional: Repayments (partial or full)
CREATE TABLE IF NOT EXISTS repayments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id             UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  amount              NUMERIC(38, 6) NOT NULL,
  tx_hash             VARCHAR(100),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Optional: Generic event log for syncing on-chain events
CREATE TABLE IF NOT EXISTS events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source              TEXT NOT NULL,                                      -- e.g., "CentrifugeHub", "Vault4626"
  event_name          TEXT NOT NULL,                                      -- e.g., "AssetMinted", "LoanApproved", "Repayment"
  tx_hash             VARCHAR(100),
  block_number        BIGINT,
  payload             JSONB,                                              -- raw decoded event data
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes -----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_wallet_address ON users (wallet_address);

CREATE INDEX IF NOT EXISTS idx_assets_owner_id ON assets (owner_id);
CREATE INDEX IF NOT EXISTS idx_assets_metadata_cid ON assets (metadata_cid);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets (status);
CREATE INDEX IF NOT EXISTS idx_assets_token ON assets (token_address, token_id);

CREATE INDEX IF NOT EXISTS idx_loans_asset_id ON loans (asset_id);
CREATE INDEX IF NOT EXISTS idx_loans_vault_address ON loans (vault_address);
CREATE INDEX IF NOT EXISTS idx_loans_status ON loans (status);
CREATE INDEX IF NOT EXISTS idx_loans_due_date ON loans (due_date);

CREATE INDEX IF NOT EXISTS idx_vault_deposits_asset_id ON vault_deposits (asset_id);
CREATE INDEX IF NOT EXISTS idx_vault_deposits_vault ON vault_deposits (vault_address);

CREATE INDEX IF NOT EXISTS idx_repayments_loan_id ON repayments (loan_id);

CREATE INDEX IF NOT EXISTS idx_events_source ON events (source);
CREATE INDEX IF NOT EXISTS idx_events_event_name ON events (event_name);
CREATE INDEX IF NOT EXISTS idx_events_tx_hash ON events (tx_hash);

-- Views (optional helpers) -----------------------------------------------

-- Active loans view
CREATE OR REPLACE VIEW v_active_loans AS
SELECT
  l.id AS loan_id,
  a.id AS asset_id,
  a.owner_id,
  l.vault_address,
  l.amount,
  l.interest_rate,
  l.start_date,
  l.due_date,
  l.status
FROM loans l
JOIN assets a ON a.id = l.asset_id
WHERE l.status = 'active';

-- Collateralized assets view
CREATE OR REPLACE VIEW v_collateralized_assets AS
SELECT
  a.* 
FROM assets a
WHERE a.status = 'collateralized';
