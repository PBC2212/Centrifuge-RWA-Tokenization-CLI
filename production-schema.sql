-- Production Database Schema for Centrifuge RWA CLI
-- Execute this before going live

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table with KYC compliance
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_address VARCHAR(42) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    kyc_status VARCHAR(20) DEFAULT 'pending' CHECK (kyc_status IN ('pending', 'approved', 'rejected')),
    kyc_provider VARCHAR(50),
    kyc_reference VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

-- Real-world assets with comprehensive metadata
CREATE TABLE assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    asset_type VARCHAR(50) NOT NULL,
    value_usd DECIMAL(18,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    
    -- Asset documentation
    documents JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    
    -- Tokenization status
    token_address VARCHAR(42),
    token_amount DECIMAL(18,8),
    tokenization_status VARCHAR(20) DEFAULT 'pending' CHECK (
        tokenization_status IN ('pending', 'in_progress', 'tokenized', 'failed')
    ),
    
    -- Centrifuge integration
    centrifuge_asset_id VARCHAR(100),
    ipfs_hash VARCHAR(100),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

-- Centrifuge pools integration
CREATE TABLE pools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    centrifuge_pool_id VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    asset_class VARCHAR(100),
    
    -- Pool metrics
    total_value_locked DECIMAL(18,2),
    apy DECIMAL(5,2),
    currency VARCHAR(3) DEFAULT 'USD',
    
    -- Pool configuration
    minimum_investment DECIMAL(18,2),
    maximum_investment DECIMAL(18,2),
    pool_status VARCHAR(20) DEFAULT 'active',
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

-- Investment positions
CREATE TABLE positions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    pool_id UUID REFERENCES pools(id) ON DELETE CASCADE,
    asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,
    
    -- Position details
    position_type VARCHAR(20) NOT NULL CHECK (position_type IN ('lend', 'borrow')),
    principal_amount DECIMAL(18,2) NOT NULL,
    current_amount DECIMAL(18,2) NOT NULL,
    interest_rate DECIMAL(5,4) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    
    -- Blockchain data
    transaction_hash VARCHAR(66),
    block_number BIGINT,
    
    -- Status tracking
    status VARCHAR(20) DEFAULT 'active' CHECK (
        status IN ('active', 'repaid', 'defaulted', 'liquidated')
    ),
    
    -- Dates
    start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    maturity_date TIMESTAMP,
    last_payment_date TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Transaction history
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    position_id UUID REFERENCES positions(id) ON DELETE SET NULL,
    
    -- Transaction details
    transaction_type VARCHAR(50) NOT NULL,
    amount DECIMAL(18,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    
    -- Blockchain data
    transaction_hash VARCHAR(66) UNIQUE,
    block_number BIGINT,
    gas_used INTEGER,
    gas_price DECIMAL(18,8),
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending' CHECK (
        status IN ('pending', 'confirmed', 'failed', 'reverted')
    ),
    
    -- Additional data
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit trail
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_users_wallet_address ON users(wallet_address);
CREATE INDEX idx_users_kyc_status ON users(kyc_status);
CREATE INDEX idx_assets_user_id ON assets(user_id);
CREATE INDEX idx_assets_tokenization_status ON assets(tokenization_status);
CREATE INDEX idx_positions_user_id ON positions(user_id);
CREATE INDEX idx_positions_pool_id ON positions(pool_id);
CREATE INDEX idx_positions_status ON positions(status);
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_hash ON transactions(transaction_hash);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- Views for common queries
CREATE VIEW user_portfolio AS
SELECT 
    u.id as user_id,
    u.wallet_address,
    COUNT(a.id) as total_assets,
    SUM(a.value_usd) as total_asset_value,
    COUNT(p.id) as active_positions,
    SUM(CASE WHEN p.position_type = 'lend' THEN p.current_amount ELSE 0 END) as total_lending,
    SUM(CASE WHEN p.position_type = 'borrow' THEN p.current_amount ELSE 0 END) as total_borrowing
FROM users u
LEFT JOIN assets a ON u.id = a.user_id AND a.is_active = true
LEFT JOIN positions p ON u.id = p.user_id AND p.status = 'active'
WHERE u.is_active = true
GROUP BY u.id, u.wallet_address;

-- Triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_assets_updated_at BEFORE UPDATE ON assets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_pools_updated_at BEFORE UPDATE ON pools FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_positions_updated_at BEFORE UPDATE ON positions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Initial admin user (replace with your actual admin wallet)
INSERT INTO users (wallet_address, email, kyc_status) 
VALUES ('0x0000000000000000000000000000000000000000', 'admin@centrifuge-rwa.com', 'approved');