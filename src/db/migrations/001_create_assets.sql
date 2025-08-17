-- src/db/migrations/001_create_assets.sql
CREATE TABLE IF NOT EXISTS assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    value_usd NUMERIC NOT NULL,
    document TEXT, -- optional path to supporting file or IPFS hash
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
