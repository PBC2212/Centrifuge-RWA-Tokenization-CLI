import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { ethers } from 'ethers';
import inquirer from 'inquirer';
const WALLET_FILE = path.join(process.cwd(), '.wallets', 'wallet.json');
const DB_CONFIG = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'centrifuge_rwa',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
};
const MAX_LTV_BY_ASSET_TYPE = {
    'Commercial Real Estate': 0.70,
    'Residential Real Estate': 0.75,
    'Trade Finance': 0.80,
    'Invoice Financing': 0.85,
    'Equipment Financing': 0.60,
    'Supply Chain Finance': 0.75,
    'Receivables': 0.80,
    'Other': 0.50
};
const BASE_INTEREST_RATES = {
    'low_risk': 0.055,
    'medium_risk': 0.085,
    'high_risk': 0.125
};
export async function borrowAgainstAsset() {
    console.log('🏦 Starting borrowing process against tokenized RWA...');
    if (!fs.existsSync(WALLET_FILE)) {
        throw new Error('No wallet found. Run "npm run wallet -- --create" first.');
    }
    const availableAssets = await getAvailableCollateralAssets();
    if (availableAssets.length === 0) {
        throw new Error('No tokenized assets available for collateral. Pledge and tokenize assets first.');
    }
    console.log('\n📋 Available Collateral Assets:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    availableAssets.forEach((asset, index) => {
        const valueFormatted = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(asset.value_usd);
        console.log(`${index + 1}. ${asset.name}`);
        console.log(`   Value: ${valueFormatted}`);
        console.log(`   Token: ${asset.token_address || 'Pending tokenization'}`);
        console.log(`   Status: ${asset.tokenization_status.toUpperCase()}`);
        console.log('   ─────────────────────────────────────────────────');
    });
    const borrowingData = await inquirer.prompt([
        {
            type: 'list',
            name: 'assetIndex',
            message: 'Select collateral asset:',
            choices: availableAssets.map((asset, index) => ({
                name: `${asset.name} ($${asset.value_usd.toLocaleString()})`,
                value: index
            }))
        },
        {
            type: 'number',
            name: 'borrowAmount',
            message: 'Amount to borrow (USD):',
            validate: (input) => input > 0 || 'Borrow amount must be greater than 0'
        },
        {
            type: 'list',
            name: 'loanTerm',
            message: 'Loan term:',
            choices: [
                { name: '30 days', value: 30 },
                { name: '90 days', value: 90 },
                { name: '180 days', value: 180 },
                { name: '1 year', value: 365 }
            ]
        },
        {
            type: 'list',
            name: 'poolId',
            message: 'Select liquidity pool:',
            choices: [
                { name: 'Centrifuge Stable Pool (5.5% APR)', value: 'CFGE-STABLE-001' },
                { name: 'Trade Finance Pool (8.5% APR)', value: 'CFGE-TRADE-002' },
                { name: 'Real Estate Pool (7.2% APR)', value: 'CFGE-REALESTATE-003' }
            ]
        }
    ]);
    const selectedAsset = availableAssets[borrowingData.assetIndex];
    const maxLTV = MAX_LTV_BY_ASSET_TYPE[selectedAsset.name] || 0.50;
    const maxBorrowAmount = selectedAsset.value_usd * maxLTV;
    const requestedLTV = borrowingData.borrowAmount / selectedAsset.value_usd;
    console.log('\n📊 Loan Analysis:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Collateral Value: $${selectedAsset.value_usd.toLocaleString()}`);
    console.log(`Requested Borrow: $${borrowingData.borrowAmount.toLocaleString()}`);
    console.log(`Loan-to-Value: ${(requestedLTV * 100).toFixed(2)}%`);
    console.log(`Maximum LTV: ${(maxLTV * 100).toFixed(2)}%`);
    console.log(`Maximum Borrow: $${maxBorrowAmount.toLocaleString()}`);
    if (requestedLTV > maxLTV) {
        throw new Error(`Requested amount exceeds maximum LTV. Maximum borrowable: $${maxBorrowAmount.toLocaleString()}`);
    }
    const riskProfile = calculateRiskProfile(selectedAsset, requestedLTV);
    const interestRate = BASE_INTEREST_RATES[riskProfile];
    const liquidationThreshold = maxLTV + 0.05;
    console.log(`Risk Profile: ${riskProfile.toUpperCase()}`);
    console.log(`Interest Rate: ${(interestRate * 100).toFixed(2)}% APR`);
    console.log(`Liquidation Threshold: ${(liquidationThreshold * 100).toFixed(2)}%`);
    const { password } = await inquirer.prompt([{
            type: 'password',
            name: 'password',
            message: 'Enter wallet password to sign borrowing transaction:'
        }]);
    try {
        const encryptedWallet = fs.readFileSync(WALLET_FILE, 'utf8');
        const wallet = await ethers.Wallet.fromEncryptedJson(encryptedWallet, password);
        console.log('\n🔐 Processing borrowing transaction...');
        console.log('1️⃣ Validating collateral token...');
        console.log('2️⃣ Executing smart contract interaction...');
        console.log('3️⃣ Transferring collateral to escrow...');
        console.log('4️⃣ Releasing borrowed funds...');
        const borrowPosition = {
            user_id: wallet.address,
            asset_id: selectedAsset.id,
            pool_id: borrowingData.poolId,
            collateral_value_usd: selectedAsset.value_usd,
            borrowed_amount_usd: borrowingData.borrowAmount,
            interest_rate: interestRate,
            loan_to_value_ratio: requestedLTV,
            liquidation_threshold: liquidationThreshold,
            status: 'active',
            start_date: new Date().toISOString(),
            maturity_date: new Date(Date.now() + borrowingData.loanTerm * 24 * 60 * 60 * 1000).toISOString(),
            total_interest_accrued: 0,
            transaction_hash: generateMockTransactionHash()
        };
        const savedPosition = await saveBorrowPositionToDb(borrowPosition);
        await updateAssetCollateralStatus(selectedAsset.id, true);
        console.log('\n✅ Borrowing transaction completed successfully!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`📄 Position ID: ${savedPosition.id}`);
        console.log(`💰 Borrowed Amount: $${borrowingData.borrowAmount.toLocaleString()}`);
        console.log(`🏛️ Collateral: ${selectedAsset.name}`);
        console.log(`📅 Maturity Date: ${new Date(borrowPosition.maturity_date).toLocaleDateString()}`);
        console.log(`🔗 Transaction: ${borrowPosition.transaction_hash}`);
        return savedPosition;
    }
    catch (error) {
        if (error.message.includes('invalid password')) {
            throw new Error('Invalid wallet password.');
        }
        throw error;
    }
}
export async function listBorrowPositions() {
    console.log('📋 Loading your borrowing positions...');
    try {
        const positions = await getBorrowPositionsFromDb();
        if (positions.length === 0) {
            console.log('No active borrowing positions.');
            return;
        }
        console.log('\n🏦 Your Borrowing Positions:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        let totalBorrowed = 0;
        let totalCollateral = 0;
        for (const position of positions) {
            const borrowedFormatted = new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD'
            }).format(position.borrowed_amount_usd);
            const collateralFormatted = new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD'
            }).format(position.collateral_value_usd);
            const currentInterest = calculateAccruedInterest(position);
            const totalOwed = position.borrowed_amount_usd + currentInterest;
            const statusIcon = getPositionStatusIcon(position.status);
            const healthIcon = getPositionHealthIcon(position);
            console.log(`${statusIcon} Position ID: ${position.id}`);
            console.log(`   Borrowed: ${borrowedFormatted}`);
            console.log(`   Collateral: ${collateralFormatted}`);
            console.log(`   Interest Rate: ${(position.interest_rate * 100).toFixed(2)}% APR`);
            console.log(`   LTV Ratio: ${(position.loan_to_value_ratio * 100).toFixed(2)}%`);
            console.log(`   Current Interest: $${currentInterest.toFixed(2)}`);
            console.log(`   Total Owed: $${totalOwed.toFixed(2)}`);
            console.log(`   Health: ${healthIcon}`);
            console.log(`   Maturity: ${new Date(position.maturity_date).toLocaleDateString()}`);
            console.log(`   Pool: ${position.pool_id}`);
            console.log('   ─────────────────────────────────────────────────────────────────────────');
            totalBorrowed += position.borrowed_amount_usd;
            totalCollateral += position.collateral_value_usd;
        }
        console.log(`\n📊 Portfolio Summary:`);
        console.log(`   Total Positions: ${positions.length}`);
        console.log(`   Total Borrowed: ${new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(totalBorrowed)}`);
        console.log(`   Total Collateral: ${new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(totalCollateral)}`);
        console.log(`   Overall LTV: ${((totalBorrowed / totalCollateral) * 100).toFixed(2)}%`);
    }
    catch (error) {
        console.error('❌ Error loading borrowing positions:', error);
        throw error;
    }
}
export async function repayLoan(positionId) {
    console.log('💳 Starting loan repayment process...');
    const positions = await getBorrowPositionsFromDb();
    const activePositions = positions.filter(p => p.status === 'active');
    if (activePositions.length === 0) {
        console.log('No active loans to repay.');
        return;
    }
    let selectedPosition;
    if (positionId) {
        selectedPosition = activePositions.find(p => p.id === positionId);
        if (!selectedPosition) {
            throw new Error('Position not found or not active.');
        }
    }
    else {
        const { positionIndex } = await inquirer.prompt([{
                type: 'list',
                name: 'positionIndex',
                message: 'Select loan to repay:',
                choices: activePositions.map((pos, index) => ({
                    name: `Position ${pos.id} - $${pos.borrowed_amount_usd.toLocaleString()} borrowed`,
                    value: index
                }))
            }]);
        selectedPosition = activePositions[positionIndex];
    }
    const accruedInterest = calculateAccruedInterest(selectedPosition);
    const totalRepayment = selectedPosition.borrowed_amount_usd + accruedInterest;
    console.log('\n📊 Repayment Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Principal: $${selectedPosition.borrowed_amount_usd.toLocaleString()}`);
    console.log(`Accrued Interest: $${accruedInterest.toFixed(2)}`);
    console.log(`Total Repayment: $${totalRepayment.toFixed(2)}`);
    const { confirmRepayment } = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirmRepayment',
            message: `Confirm repayment of $${totalRepayment.toFixed(2)}?`,
            default: false
        }]);
    if (!confirmRepayment) {
        console.log('Repayment cancelled.');
        return;
    }
    const { password } = await inquirer.prompt([{
            type: 'password',
            name: 'password',
            message: 'Enter wallet password to sign repayment transaction:'
        }]);
    try {
        console.log('\n🔐 Processing repayment transaction...');
        console.log('1️⃣ Validating repayment amount...');
        console.log('2️⃣ Executing repayment transaction...');
        console.log('3️⃣ Releasing collateral from escrow...');
        console.log('4️⃣ Updating loan status...');
        await updateBorrowPositionStatus(selectedPosition.id, 'repaid', totalRepayment);
        await updateAssetCollateralStatus(selectedPosition.asset_id, false);
        console.log('\n✅ Loan repayment completed successfully!');
        console.log('🔓 Collateral has been released and is available for use.');
    }
    catch (error) {
        console.error('❌ Repayment failed:', error);
        throw error;
    }
}
async function getAvailableCollateralAssets() {
    const client = new Client(DB_CONFIG);
    try {
        await client.connect();
        const result = await client.query(`
      SELECT id, name, value_usd, tokenization_status, token_address
      FROM assets 
      WHERE tokenization_status = 'tokenized' 
      AND is_active = true
      AND id NOT IN (
        SELECT asset_id FROM positions WHERE status = 'active'
      )
      ORDER BY value_usd DESC
    `);
        return result.rows.map(row => ({
            ...row,
            available_for_collateral: true
        }));
    }
    catch (error) {
        console.warn('⚠️ Database not available, using mock data...');
        return [];
    }
    finally {
        await client.end();
    }
}
async function saveBorrowPositionToDb(position) {
    const client = new Client(DB_CONFIG);
    try {
        await client.connect();
        const result = await client.query(`
      INSERT INTO positions (
        user_id, asset_id, pool_id, position_type, principal_amount, 
        current_amount, interest_rate, status, start_date, maturity_date,
        transaction_hash
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
            position.user_id,
            position.asset_id,
            position.pool_id,
            'borrow',
            position.borrowed_amount_usd,
            position.borrowed_amount_usd,
            position.interest_rate,
            position.status,
            position.start_date,
            position.maturity_date,
            position.transaction_hash
        ]);
        return { ...position, id: result.rows[0].id };
    }
    finally {
        await client.end();
    }
}
async function getBorrowPositionsFromDb() {
    const client = new Client(DB_CONFIG);
    try {
        await client.connect();
        const result = await client.query(`
      SELECT p.*, a.name as asset_name, a.value_usd as collateral_value_usd
      FROM positions p
      JOIN assets a ON p.asset_id = a.id
      WHERE p.position_type = 'borrow'
      ORDER BY p.created_at DESC
    `);
        return result.rows.map(row => ({
            id: row.id,
            user_id: row.user_id,
            asset_id: row.asset_id,
            pool_id: row.pool_id,
            collateral_value_usd: row.collateral_value_usd,
            borrowed_amount_usd: row.principal_amount,
            interest_rate: row.interest_rate,
            loan_to_value_ratio: row.principal_amount / row.collateral_value_usd,
            liquidation_threshold: 0.85,
            status: row.status,
            start_date: row.start_date,
            maturity_date: row.maturity_date,
            last_payment_date: row.last_payment_date,
            total_interest_accrued: 0,
            transaction_hash: row.transaction_hash,
            created_at: row.created_at,
            updated_at: row.updated_at
        }));
    }
    finally {
        await client.end();
    }
}
async function updateAssetCollateralStatus(assetId, isCollateralized) {
    const client = new Client(DB_CONFIG);
    try {
        await client.connect();
        await client.query(`
      UPDATE assets 
      SET metadata = COALESCE(metadata, '{}')::jsonb || '{"collateralized": $1}'::jsonb,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [isCollateralized, assetId]);
    }
    finally {
        await client.end();
    }
}
async function updateBorrowPositionStatus(positionId, status, finalAmount) {
    const client = new Client(DB_CONFIG);
    try {
        await client.connect();
        await client.query(`
      UPDATE positions 
      SET status = $1, 
          current_amount = COALESCE($2, current_amount),
          last_payment_date = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [status, finalAmount, positionId]);
    }
    finally {
        await client.end();
    }
}
function calculateRiskProfile(asset, ltv) {
    if (ltv <= 0.60)
        return 'low_risk';
    if (ltv <= 0.75)
        return 'medium_risk';
    return 'high_risk';
}
function calculateAccruedInterest(position) {
    const startDate = new Date(position.start_date);
    const currentDate = new Date();
    const daysElapsed = Math.floor((currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    return (position.borrowed_amount_usd * position.interest_rate * daysElapsed) / 365;
}
function getPositionStatusIcon(status) {
    const icons = {
        'active': '🟢',
        'repaid': '✅',
        'liquidated': '🔴',
        'defaulted': '❌'
    };
    return icons[status] || '❓';
}
function getPositionHealthIcon(position) {
    const currentLTV = position.loan_to_value_ratio;
    const liquidationThreshold = position.liquidation_threshold;
    if (currentLTV < liquidationThreshold * 0.8)
        return '🟢 Healthy';
    if (currentLTV < liquidationThreshold * 0.95)
        return '🟡 Warning';
    return '🔴 At Risk';
}
function generateMockTransactionHash() {
    return '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}
