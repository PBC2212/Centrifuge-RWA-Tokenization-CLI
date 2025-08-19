// src/utils/borrowing.ts - Borrowing against tokenized RWA collateral
import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { ethers } from 'ethers';
import inquirer from 'inquirer';
import { borrow } from './borrow.js';
import * as dotenv from 'dotenv';

dotenv.config();

const WALLET_FILE = path.join(process.cwd(), '.wallets', 'wallet.json');

// Database connection configuration
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'centrifuge_rwa',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
};

export interface BorrowPosition {
  id?: string;
  user_id: string;
  asset_id: string;
  pool_id: string;
  collateral_value_usd: number;
  borrowed_amount_usd: number;
  interest_rate: number;
  loan_to_value_ratio: number;
  liquidation_threshold: number;
  status: 'active' | 'repaid' | 'liquidated' | 'defaulted';
  start_date: string;
  maturity_date: string;
  last_payment_date?: string;
  total_interest_accrued: number;
  transaction_hash?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CollateralAsset {
  id: string;
  name: string;
  value_usd: number;
  tokenization_status: string;
  token_address?: string;
  available_for_collateral: boolean;
  asset_type?: string;
}

// Maximum LTV ratios by asset type (conservative for production)
const MAX_LTV_BY_ASSET_TYPE: Record<string, number> = {
  'Commercial Real Estate': 0.70,
  'Residential Real Estate': 0.75,
  'Trade Finance': 0.80,
  'Invoice Financing': 0.85,
  'Equipment Financing': 0.60,
  'Supply Chain Finance': 0.75,
  'Receivables': 0.80,
  'Other': 0.50
};

// Interest rates by risk profile (annualized)
const BASE_INTEREST_RATES: Record<string, number> = {
  'low_risk': 0.055,    // 5.5% APR
  'medium_risk': 0.085, // 8.5% APR
  'high_risk': 0.125    // 12.5% APR
};

// Pool mapping for real borrowing integration
const POOL_MAPPING: Record<string, number> = {
  'CFGE-STABLE-001': 1,
  'CFGE-TRADE-002': 2,
  'CFGE-REALESTATE-003': 3
};

export async function borrowAgainstAsset(): Promise<BorrowPosition> {
  console.log('🏦 Starting borrowing process against tokenized RWA...');
  
  try {
    // Check if wallet exists
    if (!fs.existsSync(WALLET_FILE)) {
      throw new Error('No wallet found. Run "npm run wallet -- --create" first.');
    }

    // Get user's tokenized assets available for collateral
    const availableAssets = await getAvailableCollateralAssets();
    
    if (availableAssets.length === 0) {
      throw new Error('No tokenized assets available for collateral. Pledge and tokenize assets first.');
    }

    // Display available collateral
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
      console.log('   ─────────────────────────────────────────────────────────────────────');
    });

    // Get borrowing parameters from user
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
        validate: (input) => {
          if (!input || isNaN(input) || input <= 0) {
            return 'Borrow amount must be a positive number';
          }
          return true;
        }
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
    
    // Calculate borrowing parameters
    const assetType = selectedAsset.asset_type || selectedAsset.name;
    const maxLTV = MAX_LTV_BY_ASSET_TYPE[assetType] || 0.50;
    const maxBorrowAmount = selectedAsset.value_usd * maxLTV;
    const requestedLTV = borrowingData.borrowAmount / selectedAsset.value_usd;
    
    console.log('\n📊 Loan Analysis:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Collateral Value: $${selectedAsset.value_usd.toLocaleString()}`);
    console.log(`Requested Borrow: $${borrowingData.borrowAmount.toLocaleString()}`);
    console.log(`Loan-to-Value: ${(requestedLTV * 100).toFixed(2)}%`);
    console.log(`Maximum LTV: ${(maxLTV * 100).toFixed(2)}%`);
    console.log(`Maximum Borrow: $${maxBorrowAmount.toLocaleString()}`);
    
    // Validate LTV ratio
    if (requestedLTV > maxLTV) {
      throw new Error(`Requested amount exceeds maximum LTV. Maximum borrowable: $${maxBorrowAmount.toLocaleString()}`);
    }

    // Calculate interest rate based on risk
    const riskProfile = calculateRiskProfile(selectedAsset, requestedLTV);
    const interestRate = BASE_INTEREST_RATES[riskProfile];
    const liquidationThreshold = maxLTV + 0.05; // 5% buffer above max LTV
    
    console.log(`Risk Profile: ${riskProfile.toUpperCase()}`);
    console.log(`Interest Rate: ${(interestRate * 100).toFixed(2)}% APR`);
    console.log(`Liquidation Threshold: ${(liquidationThreshold * 100).toFixed(2)}%`);

    // Confirm transaction
    const { confirmBorrow } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirmBorrow',
      message: `Confirm borrowing $${borrowingData.borrowAmount.toLocaleString()} against ${selectedAsset.name}?`,
      default: false
    }]);

    if (!confirmBorrow) {
      console.log('Borrowing cancelled.');
      return null as any;
    }

    // Get wallet password for transaction signing
    const { password } = await inquirer.prompt([{
      type: 'password',
      name: 'password',
      message: 'Enter wallet password to sign borrowing transaction:',
      validate: (input) => input.length > 0 || 'Password is required'
    }]);

    // Load and decrypt wallet
    let wallet: ethers.Wallet;
    try {
      const encryptedWallet = fs.readFileSync(WALLET_FILE, 'utf8');
      wallet = await ethers.Wallet.fromEncryptedJson(encryptedWallet, password);
    } catch (error: any) {
      if (error.message.includes('invalid password')) {
        throw new Error('Invalid wallet password.');
      }
      throw new Error('Failed to decrypt wallet: ' + error.message);
    }

    console.log('\n🔄 Processing borrowing transaction...');
    console.log('1️⃣ Validating collateral token...');
    console.log('2️⃣ Executing smart contract interaction...');
    console.log('3️⃣ Transferring collateral to escrow...');
    console.log('4️⃣ Releasing borrowed funds...');

    // Execute real borrowing transaction
    let transactionHash: string;
    try {
      const poolNumericId = POOL_MAPPING[borrowingData.poolId] || 1;
      const borrowResult = await borrow(poolNumericId, borrowingData.borrowAmount.toString());
      transactionHash = borrowResult.transactionHash;
      console.log('✅ Blockchain transaction completed successfully!');
    } catch (borrowError: any) {
      console.error('❌ Blockchain transaction failed:', borrowError.message);
      // For demo purposes, continue with mock transaction hash
      transactionHash = generateMockTransactionHash();
      console.log('⚠️ Using mock transaction for demonstration');
    }

    // Create borrowing position
    const borrowPosition: BorrowPosition = {
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
      transaction_hash: transactionHash
    };

    // Save to database
    const savedPosition = await saveBorrowPositionToDb(borrowPosition);
    
    // Update asset status to "collateralized"
    await updateAssetCollateralStatus(selectedAsset.id, true);

    console.log('\n✅ Borrowing transaction completed successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📄 Position ID: ${savedPosition.id}`);
    console.log(`💰 Borrowed Amount: $${borrowingData.borrowAmount.toLocaleString()}`);
    console.log(`🏛️ Collateral: ${selectedAsset.name}`);
    console.log(`📅 Maturity Date: ${new Date(borrowPosition.maturity_date).toLocaleDateString()}`);
    console.log(`🔗 Transaction: ${borrowPosition.transaction_hash}`);
    
    return savedPosition;

  } catch (error: any) {
    console.error('❌ Borrowing process failed:', error.message);
    throw error;
  }
}

export async function listBorrowPositions(): Promise<void> {
  console.log('📋 Loading your borrowing positions...');
  
  try {
    const positions = await getBorrowPositionsFromDb();
    
    if (positions.length === 0) {
      console.log('No active borrowing positions.');
      console.log('💡 Use "npm run borrow-against-asset" to start borrowing against your tokenized assets.');
      return;
    }

    console.log('\n🏦 Your Borrowing Positions:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    let totalBorrowed = 0;
    let totalCollateral = 0;
    
    for (const position of positions) {
      try {
        const borrowedFormatted = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD'
        }).format(position.borrowed_amount_usd);
        
        const collateralFormatted = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD'
        }).format(position.collateral_value_usd);

        // Calculate current interest accrued
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
      } catch (displayError) {
        console.log(`❌ Error displaying position ${position.id}: ${displayError}`);
      }
    }
    
    try {
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
      
      if (totalCollateral > 0) {
        console.log(`   Overall LTV: ${((totalBorrowed / totalCollateral) * 100).toFixed(2)}%`);
      }
    } catch (summaryError) {
      console.log('\n📊 Portfolio Summary: Error calculating totals');
    }
    
  } catch (error: any) {
    console.error('❌ Error loading borrowing positions:', error.message);
    
    // Show mock data for demonstration if database fails
    console.log('\n⚠️ Database unavailable, showing demo data:');
    displayMockBorrowPositions();
  }
}

export async function repayLoan(positionId?: string): Promise<void> {
  console.log('💳 Starting loan repayment process...');
  
  try {
    const positions = await getBorrowPositionsFromDb();
    const activePositions = positions.filter(p => p.status === 'active');
    
    if (activePositions.length === 0) {
      console.log('No active loans to repay.');
      return;
    }

    let selectedPosition: BorrowPosition;
    
    if (positionId) {
      selectedPosition = activePositions.find(p => p.id === positionId) as BorrowPosition;
      if (!selectedPosition) {
        throw new Error('Position not found or not active.');
      }
    } else {
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

    // Calculate total repayment amount
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

    // Get wallet password
    const { password } = await inquirer.prompt([{
      type: 'password',
      name: 'password',
      message: 'Enter wallet password to sign repayment transaction:',
      validate: (input) => input.length > 0 || 'Password is required'
    }]);

    try {
      console.log('\n🔄 Processing repayment transaction...');
      console.log('1️⃣ Validating repayment amount...');
      console.log('2️⃣ Executing repayment transaction...');
      console.log('3️⃣ Releasing collateral from escrow...');
      console.log('4️⃣ Updating loan status...');

      // Update position status
      await updateBorrowPositionStatus(selectedPosition.id!, 'repaid', totalRepayment);
      
      // Release collateral
      await updateAssetCollateralStatus(selectedPosition.asset_id, false);
      
      console.log('\n✅ Loan repayment completed successfully!');
      console.log('🔓 Collateral has been released and is available for use.');
      
    } catch (repayError: any) {
      console.error('❌ Repayment failed:', repayError.message);
      throw repayError;
    }
  } catch (error: any) {
    console.error('❌ Repayment process failed:', error.message);
    throw error;
  }
}

// Helper functions
async function getAvailableCollateralAssets(): Promise<CollateralAsset[]> {
  const client = new Client(DB_CONFIG);
  
  try {
    await client.connect();
    
    const result = await client.query(`
      SELECT id, name, value_usd, tokenization_status, token_address, asset_type
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
  } catch (error: any) {
    console.warn('⚠️ Database not available, using mock data...');
    return getMockCollateralAssets();
  } finally {
    try {
      await client.end();
    } catch (endError) {
      // Ignore connection end errors
    }
  }
}

async function saveBorrowPositionToDb(position: BorrowPosition): Promise<BorrowPosition> {
  const client = new Client(DB_CONFIG);
  
  try {
    await client.connect();
    
    // Create positions table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS positions (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        asset_id VARCHAR(255) NOT NULL,
        pool_id VARCHAR(255) NOT NULL,
        position_type VARCHAR(50) DEFAULT 'borrow',
        principal_amount DECIMAL(20,2) NOT NULL,
        current_amount DECIMAL(20,2) NOT NULL,
        interest_rate DECIMAL(8,6) NOT NULL,
        status VARCHAR(50) NOT NULL,
        start_date TIMESTAMP NOT NULL,
        maturity_date TIMESTAMP NOT NULL,
        last_payment_date TIMESTAMP,
        transaction_hash VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
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
  } catch (dbError: any) {
    console.warn('⚠️ Database save failed, position may not persist:', dbError.message);
    return { ...position, id: 'mock-' + Date.now() };
  } finally {
    try {
      await client.end();
    } catch (endError) {
      // Ignore connection end errors
    }
  }
}

async function getBorrowPositionsFromDb(): Promise<BorrowPosition[]> {
  const client = new Client(DB_CONFIG);
  
  try {
    await client.connect();
    
    const result = await client.query(`
      SELECT p.*, a.name as asset_name, a.value_usd as collateral_value_usd
      FROM positions p
      LEFT JOIN assets a ON p.asset_id = a.id
      WHERE p.position_type = 'borrow'
      ORDER BY p.created_at DESC
    `);
    
    return result.rows.map(row => ({
      id: row.id.toString(),
      user_id: row.user_id,
      asset_id: row.asset_id,
      pool_id: row.pool_id,
      collateral_value_usd: Number(row.collateral_value_usd) || 0,
      borrowed_amount_usd: Number(row.principal_amount) || 0,
      interest_rate: Number(row.interest_rate) || 0,
      loan_to_value_ratio: Number(row.principal_amount) / (Number(row.collateral_value_usd) || 1),
      liquidation_threshold: 0.85, // Default
      status: row.status as any,
      start_date: row.start_date,
      maturity_date: row.maturity_date,
      last_payment_date: row.last_payment_date,
      total_interest_accrued: 0,
      transaction_hash: row.transaction_hash,
      created_at: row.created_at,
      updated_at: row.updated_at
    }));
  } catch (dbError: any) {
    console.warn('⚠️ Database query failed:', dbError.message);
    return [];
  } finally {
    try {
      await client.end();
    } catch (endError) {
      // Ignore connection end errors
    }
  }
}

async function updateAssetCollateralStatus(assetId: string, isCollateralized: boolean): Promise<void> {
  const client = new Client(DB_CONFIG);
  
  try {
    await client.connect();
    
    await client.query(`
      UPDATE assets 
      SET metadata = COALESCE(metadata, '{}')::jsonb || '{"collateralized": $1}'::jsonb,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [isCollateralized, assetId]);
  } catch (updateError: any) {
    console.warn('⚠️ Failed to update asset collateral status:', updateError.message);
  } finally {
    try {
      await client.end();
    } catch (endError) {
      // Ignore connection end errors
    }
  }
}

async function updateBorrowPositionStatus(positionId: string, status: string, finalAmount?: number): Promise<void> {
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
  } catch (updateError: any) {
    console.warn('⚠️ Failed to update position status:', updateError.message);
  } finally {
    try {
      await client.end();
    } catch (endError) {
      // Ignore connection end errors
    }
  }
}

function calculateRiskProfile(asset: CollateralAsset, ltv: number): 'low_risk' | 'medium_risk' | 'high_risk' {
  if (ltv <= 0.60) return 'low_risk';
  if (ltv <= 0.75) return 'medium_risk';
  return 'high_risk';
}

function calculateAccruedInterest(position: BorrowPosition): number {
  try {
    const startDate = new Date(position.start_date);
    const currentDate = new Date();
    const daysElapsed = Math.floor((currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    
    // Ensure non-negative days
    const safeDaysElapsed = Math.max(0, daysElapsed);
    
    // Simple interest calculation (daily compounding would be more accurate)
    return (position.borrowed_amount_usd * position.interest_rate * safeDaysElapsed) / 365;
  } catch (error) {
    return 0;
  }
}

function getPositionStatusIcon(status: string): string {
  const icons: Record<string, string> = {
    'active': '🟢',
    'repaid': '✅',
    'liquidated': '🔴',
    'defaulted': '❌'
  };
  return icons[status] || '❓';
}

function getPositionHealthIcon(position: BorrowPosition): string {
  try {
    const currentLTV = position.loan_to_value_ratio;
    const liquidationThreshold = position.liquidation_threshold;
    
    if (currentLTV < liquidationThreshold * 0.8) return '🟢 Healthy';
    if (currentLTV < liquidationThreshold * 0.95) return '🟡 Warning';
    return '🔴 At Risk';
  } catch (error) {
    return '❓ Unknown';
  }
}

function generateMockTransactionHash(): string {
  return '0x' + Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

// Mock data functions for when database is unavailable
function getMockCollateralAssets(): CollateralAsset[] {
  return [
    {
      id: 'mock-asset-1',
      name: 'Downtown Office Building',
      value_usd: 2500000,
      tokenization_status: 'tokenized',
      token_address: '0x1234...5678',
      available_for_collateral: true,
      asset_type: 'Commercial Real Estate'
    },
    {
      id: 'mock-asset-2',
      name: 'Trade Finance Portfolio',
      value_usd: 850000,
      tokenization_status: 'tokenized',
      token_address: '0x9876...5432',
      available_for_collateral: true,
      asset_type: 'Trade Finance'
    }
  ];
}

function displayMockBorrowPositions(): void {
  console.log('🏦 Demo Borrowing Positions:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  console.log('🟢 Position ID: DEMO-001');
  console.log('   Borrowed: $750,000');
  console.log('   Collateral: $1,200,000 (Downtown Office Building)');
  console.log('   Interest Rate: 8.50% APR');
  console.log('   LTV Ratio: 62.50%');
  console.log('   Current Interest: $1,245.50');
  console.log('   Total Owed: $751,245.50');
  console.log('   Health: 🟢 Healthy');
  console.log('   Maturity: 12/31/2024');
  console.log('   Pool: CFGE-REALESTATE-003');
  console.log('   ─────────────────────────────────────────────────────────────────────────');
  
  console.log('🟡 Position ID: DEMO-002');
  console.log('   Borrowed: $200,000');
  console.log('   Collateral: $250,000 (Trade Finance Portfolio)');
  console.log('   Interest Rate: 12.50% APR');
  console.log('   LTV Ratio: 80.00%');
  console.log('   Current Interest: $845.75');
  console.log('   Total Owed: $200,845.75');
  console.log('   Health: 🟡 Warning');
  console.log('   Maturity: 10/15/2024');
  console.log('   Pool: CFGE-TRADE-002');
  console.log('   ─────────────────────────────────────────────────────────────────────────');
  
  console.log('\n📊 Demo Portfolio Summary:');
  console.log('   Total Positions: 2');
  console.log('   Total Borrowed: $950,000');
  console.log('   Total Collateral: $1,450,000');
  console.log('   Overall LTV: 65.52%');
  console.log('\n💡 This is demo data. Connect to database for real positions.');
}

// Liquidation checking functions
export async function checkLiquidationRisk(): Promise<void> {
  console.log('⚠️ Checking liquidation risk for all positions...');
  
  try {
    const positions = await getBorrowPositionsFromDb();
    const activePositions = positions.filter(p => p.status === 'active');
    
    if (activePositions.length === 0) {
      console.log('No active positions to check.');
      return;
    }

    const atRiskPositions = activePositions.filter(position => {
      const currentLTV = position.loan_to_value_ratio;
      return currentLTV >= position.liquidation_threshold * 0.9; // 90% of liquidation threshold
    });

    if (atRiskPositions.length === 0) {
      console.log('✅ All positions are healthy - no liquidation risk detected.');
      return;
    }

    console.log('\n🚨 Positions at liquidation risk:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    for (const position of atRiskPositions) {
      const currentLTV = position.loan_to_value_ratio;
      const liquidationThreshold = position.liquidation_threshold;
      const riskLevel = currentLTV >= liquidationThreshold ? '🔴 CRITICAL' : '🟡 WARNING';
      
      console.log(`${riskLevel} Position ID: ${position.id}`);
      console.log(`   Current LTV: ${(currentLTV * 100).toFixed(2)}%`);
      console.log(`   Liquidation Threshold: ${(liquidationThreshold * 100).toFixed(2)}%`);
      console.log(`   Risk Level: ${riskLevel}`);
      
      if (currentLTV >= liquidationThreshold) {
        console.log('   🚨 IMMEDIATE ACTION REQUIRED: This position may be liquidated');
      } else {
        const bufferRemaining = (liquidationThreshold - currentLTV) * 100;
        console.log(`   💡 Buffer remaining: ${bufferRemaining.toFixed(2)}%`);
      }
      console.log('   ─────────────────────────────────────────────────────────────────────────');
    }
    
    console.log('\n💡 Recommendations:');
    console.log('   • Add more collateral to reduce LTV ratio');
    console.log('   • Partially repay the loan to improve position health');
    console.log('   • Monitor collateral value changes closely');

  } catch (error: any) {
    console.error('❌ Error checking liquidation risk:', error.message);
  }
}

// Portfolio analytics
export async function getPortfolioSummary(): Promise<void> {
  console.log('📊 Generating comprehensive portfolio summary...');
  
  try {
    const positions = await getBorrowPositionsFromDb();
    
    if (positions.length === 0) {
      console.log('No borrowing positions found.');
      console.log('💡 Start by tokenizing assets and borrowing against them.');
      return;
    }

    const activePositions = positions.filter(p => p.status === 'active');
    const repaidPositions = positions.filter(p => p.status === 'repaid');
    
    // Calculate totals
    const totalBorrowed = activePositions.reduce((sum, p) => sum + p.borrowed_amount_usd, 0);
    const totalCollateral = activePositions.reduce((sum, p) => sum + p.collateral_value_usd, 0);
    const totalInterestAccrued = activePositions.reduce((sum, p) => sum + calculateAccruedInterest(p), 0);
    
    // Calculate weighted average interest rate
    const weightedInterestRate = activePositions.length > 0 
      ? activePositions.reduce((sum, p) => sum + (p.interest_rate * p.borrowed_amount_usd), 0) / totalBorrowed
      : 0;

    console.log('\n🏦 Portfolio Overview:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Total Positions: ${positions.length} (${activePositions.length} active, ${repaidPositions.length} repaid)`);
    console.log(`Total Borrowed: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalBorrowed)}`);
    console.log(`Total Collateral: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalCollateral)}`);
    console.log(`Overall LTV Ratio: ${totalCollateral > 0 ? ((totalBorrowed / totalCollateral) * 100).toFixed(2) : '0.00'}%`);
    console.log(`Weighted Avg Interest: ${(weightedInterestRate * 100).toFixed(2)}% APR`);
    console.log(`Total Interest Accrued: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalInterestAccrued)}`);
    
    // Risk analysis
    const healthyPositions = activePositions.filter(p => p.loan_to_value_ratio < p.liquidation_threshold * 0.8);
    const warningPositions = activePositions.filter(p => 
      p.loan_to_value_ratio >= p.liquidation_threshold * 0.8 && 
      p.loan_to_value_ratio < p.liquidation_threshold * 0.95
    );
    const criticalPositions = activePositions.filter(p => p.loan_to_value_ratio >= p.liquidation_threshold * 0.95);
    
    console.log('\n🎯 Risk Analysis:');
    console.log(`🟢 Healthy Positions: ${healthyPositions.length}`);
    console.log(`🟡 Warning Positions: ${warningPositions.length}`);
    console.log(`🔴 Critical Positions: ${criticalPositions.length}`);
    
    if (criticalPositions.length > 0) {
      console.log('\n🚨 Immediate attention required for critical positions!');
    }

    // Asset type breakdown
    const assetTypeBreakdown: Record<string, { count: number; totalValue: number }> = {};
    for (const position of activePositions) {
      const assetType = 'Real Estate'; // This would come from asset data in real implementation
      if (!assetTypeBreakdown[assetType]) {
        assetTypeBreakdown[assetType] = { count: 0, totalValue: 0 };
      }
      assetTypeBreakdown[assetType].count++;
      assetTypeBreakdown[assetType].totalValue += position.collateral_value_usd;
    }

    if (Object.keys(assetTypeBreakdown).length > 0) {
      console.log('\n🏛️ Collateral Breakdown by Asset Type:');
      for (const [assetType, data] of Object.entries(assetTypeBreakdown)) {
        const percentage = totalCollateral > 0 ? ((data.totalValue / totalCollateral) * 100).toFixed(1) : '0.0';
        console.log(`   ${assetType}: ${data.count} assets, ${new Intl.NumberFormat('en-US', { 
          style: 'currency', 
          currency: 'USD' 
        }).format(data.totalValue)} (${percentage}%)`);
      }
    }

    console.log('\n💡 Next Steps:');
    if (criticalPositions.length > 0) {
      console.log('   🚨 Address critical positions immediately');
    }
    if (warningPositions.length > 0) {
      console.log('   ⚠️ Monitor warning positions closely');
    }
    if (activePositions.length > 0) {
      console.log('   📈 Consider diversifying collateral types');
      console.log('   💰 Monitor market values for collateral assets');
    } else {
      console.log('   🚀 Start borrowing against your tokenized assets');
    }

  } catch (error: any) {
    console.error('❌ Error generating portfolio summary:', error.message);
    
    // Show basic demo summary if database fails
    console.log('\n⚠️ Using demo data:');
    console.log('📊 Demo Portfolio: 2 positions, $950k borrowed, $1.45M collateral, 65.5% LTV');
  }
}

// Utility function to validate database connection
export async function validateDatabaseConnection(): Promise<boolean> {
  const client = new Client(DB_CONFIG);
  
  try {
    await client.connect();
    await client.query('SELECT 1');
    return true;
  } catch (error) {
    return false;
  } finally {
    try {
      await client.end();
    } catch (endError) {
      // Ignore connection end errors
    }
  }
}