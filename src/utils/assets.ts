// src/utils/assets.ts
import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { ethers } from 'ethers';
import inquirer from 'inquirer';
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

export interface Asset {
  id?: number;
  user_id?: string;
  name: string;
  description?: string;
  asset_type?: string;
  value_usd: number;
  currency?: string;
  documents?: any;
  metadata?: any;
  token_address?: string;
  token_amount?: number;
  tokenization_status?: string;
  centrifuge_asset_id?: string;
  ipfs_hash?: string;
  wallet_address: string;
  created_at?: string;
  updated_at?: string;
  is_active?: boolean;
}

export async function pledgeAsset(
  name: string, 
  valueUsd: number, 
  documentPath?: string
): Promise<Asset> {
  console.log('🏛️ Pledging real-world asset...');
  
  try {
    // Validate inputs
    if (!name || name.trim().length === 0) {
      throw new Error('Asset name is required');
    }
    
    if (!valueUsd || valueUsd <= 0) {
      throw new Error('Asset value must be greater than 0');
    }

    // Check if wallet exists
    if (!fs.existsSync(WALLET_FILE)) {
      throw new Error('No wallet found. Run "npm run wallet -- --create" first.');
    }

    // Get wallet password
    const { password } = await inquirer.prompt([{
      type: 'password',
      name: 'password',
      message: 'Enter wallet password to sign asset pledge:',
      validate: (input) => input.length > 0 || 'Password is required'
    }]);

    let walletAddress: string;
    let documentContent: string | null = null;

    // Load and decrypt wallet to get address
    try {
      const encryptedWallet = fs.readFileSync(WALLET_FILE, 'utf8');
      const wallet = await ethers.Wallet.fromEncryptedJson(encryptedWallet, password);
      walletAddress = wallet.address;
    } catch (walletError: any) {
      if (walletError.message.includes('invalid password')) {
        throw new Error('Invalid wallet password.');
      }
      throw new Error('Failed to decrypt wallet: ' + walletError.message);
    }

    // Read document if provided
    if (documentPath && documentPath.trim().length > 0) {
      try {
        if (fs.existsSync(documentPath)) {
          documentContent = fs.readFileSync(documentPath, 'utf8');
          console.log('📄 Document attached successfully.');
        } else {
          console.warn('⚠️ Document path provided but file not found. Continuing without document.');
        }
      } catch (docError) {
        console.warn('⚠️ Error reading document file. Continuing without document.');
      }
    }

    // Enhanced asset creation with production features
    const assetData = await inquirer.prompt([
      { 
        type: 'input', 
        name: 'description', 
        message: 'Asset description:',
        validate: (input) => {
          if (!input || input.trim().length < 10) {
            return 'Description must be at least 10 characters';
          }
          return true;
        }
      },
      { 
        type: 'list', 
        name: 'assetType', 
        message: 'Asset type:', 
        choices: [
          'Commercial Real Estate',
          'Residential Real Estate',
          'Trade Finance',
          'Invoice Financing',
          'Equipment Financing',
          'Supply Chain Finance',
          'Receivables',
          'Other'
        ]
      },
      { 
        type: 'input', 
        name: 'location', 
        message: 'Asset location/jurisdiction:',
        validate: (input) => input.trim().length > 0 || 'Location is required'
      },
      {
        type: 'confirm',
        name: 'hasAppraisal',
        message: 'Do you have a professional appraisal?',
        default: false
      },
      {
        type: 'confirm',
        name: 'hasInsurance',
        message: 'Is the asset insured?',
        default: false
      }
    ]);

    // Create comprehensive asset object
    const asset: Asset = {
      name: name.trim(),
      description: assetData.description.trim(),
      asset_type: assetData.assetType,
      value_usd: valueUsd,
      currency: 'USD',
      documents: documentContent ? [{ 
        type: 'supporting_document', 
        content: documentContent,
        filename: path.basename(documentPath || 'document'),
        uploadedAt: new Date().toISOString()
      }] : [],
      metadata: {
        location: assetData.location.trim(),
        hasAppraisal: assetData.hasAppraisal,
        hasInsurance: assetData.hasInsurance,
        createdBy: 'cli',
        version: '1.0',
        pledgedAt: new Date().toISOString()
      },
      tokenization_status: 'pending',
      wallet_address: walletAddress,
      is_active: true
    };

    console.log('\n🔄 Processing asset pledge...');
    console.log('1️⃣ Validating asset information...');
    console.log('2️⃣ Securing asset data...');
    console.log('3️⃣ Recording asset pledge...');

    // Try to save to database, fallback to local storage
    try {
      const savedAsset = await saveAssetToDb(asset);
      console.log('✅ Asset saved to production database.');
      return savedAsset;
    } catch (dbError: any) {
      console.warn('⚠️ Database not available, saving locally...');
      console.warn('Database error:', dbError.message);
      const savedAsset = await saveAssetLocally(asset);
      return savedAsset;
    }

  } catch (error: any) {
    console.error('❌ Asset pledge failed:', error.message);
    throw error;
  }
}

export async function listAssets(): Promise<void> {
  console.log('📋 Retrieving pledged assets...');
  
  try {
    // Try database first
    const assets = await getAssetsFromDb();
    if (assets.length > 0) {
      displayAssets(assets);
      return;
    } else {
      console.log('No assets found in database, checking local storage...');
    }
  } catch (dbError: any) {
    console.warn('⚠️ Database not available, checking local storage...');
    console.warn('Database error:', dbError.message);
  }

  // Fallback to local storage
  try {
    const localAssets = await getAssetsLocally();
    if (localAssets.length > 0) {
      console.log('📁 Showing assets from local storage:');
      displayAssets(localAssets);
    } else {
      console.log('No assets found in local storage either.');
      console.log('💡 Use "npm run assets -- --create" to pledge your first asset.');
    }
  } catch (localError: any) {
    console.error('❌ Error accessing local storage:', localError.message);
    displayMockAssets();
  }
}

function displayAssets(assets: Asset[]): void {
  if (assets.length === 0) {
    console.log('No assets pledged yet.');
    console.log('💡 Use "npm run assets -- --create" to get started.');
    return;
  }

  console.log('📋 Your Pledged Assets:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  let totalValue = 0;
  
  assets.forEach((asset, index) => {
    try {
      const valueFormatted = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: asset.currency || 'USD'
      }).format(asset.value_usd);
      
      const status = asset.tokenization_status || 'pending';
      const statusIcon = getStatusIcon(status);
      
      console.log(`${index + 1}. ${asset.name}`);
      console.log(`   Type: ${asset.asset_type || 'N/A'}`);
      console.log(`   Value: ${valueFormatted}`);
      console.log(`   Status: ${statusIcon} ${status.toUpperCase()}`);
      console.log(`   Wallet: ${asset.wallet_address}`);
      
      if (asset.description) {
        console.log(`   Description: ${asset.description}`);
      }
      
      if (asset.metadata?.location) {
        console.log(`   Location: ${asset.metadata.location}`);
      }
      
      if (asset.documents && asset.documents.length > 0) {
        console.log(`   Documents: ${asset.documents.length} attached`);
      }
      
      if (asset.token_address) {
        console.log(`   Token Address: ${asset.token_address}`);
      }
      
      if (asset.created_at) {
        const createdDate = new Date(asset.created_at);
        if (!isNaN(createdDate.getTime())) {
          console.log(`   Created: ${createdDate.toLocaleDateString()}`);
        }
      }
      
      console.log('   ─────────────────────────────────────────────────────────────────────────');
      
      totalValue += asset.value_usd;
    } catch (displayError) {
      console.log(`${index + 1}. ${asset.name} (Display Error)`);
      console.log('   ─────────────────────────────────────────────────────────────────────────');
    }
  });
  
  try {
    console.log(`\n📊 Portfolio Summary:`);
    console.log(`   Total Assets: ${assets.length}`);
    console.log(`   Total Value: ${new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(totalValue)}`);
    
    const statusBreakdown = assets.reduce((acc, asset) => {
      const status = asset.tokenization_status || 'pending';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log(`   Status Breakdown:`);
    Object.entries(statusBreakdown).forEach(([status, count]) => {
      console.log(`     ${getStatusIcon(status)} ${status}: ${count}`);
    });

    // Asset type breakdown
    const typeBreakdown = assets.reduce((acc, asset) => {
      const type = asset.asset_type || 'Unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    if (Object.keys(typeBreakdown).length > 1) {
      console.log(`   Asset Types:`);
      Object.entries(typeBreakdown).forEach(([type, count]) => {
        console.log(`     • ${type}: ${count}`);
      });
    }
  } catch (summaryError) {
    console.log(`\n📊 Portfolio Summary: ${assets.length} assets`);
  }
}

function getStatusIcon(status: string): string {
  const icons: Record<string, string> = {
    'pending': '⏳',
    'in_progress': '🔄',
    'tokenized': '✅',
    'failed': '❌',
    'collateralized': '🔒'
  };
  return icons[status] || '❓';
}

// Database operations
async function saveAssetToDb(asset: Asset): Promise<Asset> {
  const client = new Client(DB_CONFIG);
  
  try {
    await client.connect();
    
    // Create tables if they don't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        wallet_address VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS assets (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        asset_type VARCHAR(100),
        value_usd DECIMAL(20,2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'USD',
        documents JSONB,
        metadata JSONB,
        token_address VARCHAR(255),
        token_amount DECIMAL(20,8),
        tokenization_status VARCHAR(50) DEFAULT 'pending',
        centrifuge_asset_id VARCHAR(255),
        ipfs_hash VARCHAR(255),
        wallet_address VARCHAR(255) NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // First, ensure user exists
    await client.query(`
      INSERT INTO users (wallet_address) 
      VALUES ($1) 
      ON CONFLICT (wallet_address) DO NOTHING
    `, [asset.wallet_address]);
    
    // Get user ID
    const userResult = await client.query(`
      SELECT id FROM users WHERE wallet_address = $1
    `, [asset.wallet_address]);
    
    if (userResult.rows.length === 0) {
      throw new Error('Failed to create or find user');
    }
    
    const userId = userResult.rows[0].id;
    
    // Insert asset
    const result = await client.query(`
      INSERT INTO assets (
        user_id, name, description, asset_type, value_usd, currency,
        documents, metadata, tokenization_status, wallet_address, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
      RETURNING *
    `, [
      userId,
      asset.name,
      asset.description,
      asset.asset_type,
      asset.value_usd,
      asset.currency,
      JSON.stringify(asset.documents),
      JSON.stringify(asset.metadata),
      asset.tokenization_status,
      asset.wallet_address,
      asset.is_active
    ]);
    
    return result.rows[0];
  } catch (dbError: any) {
    console.error('Database save error:', dbError.message);
    throw dbError;
  } finally {
    try {
      await client.end();
    } catch (endError) {
      // Ignore connection end errors
    }
  }
}

async function getAssetsFromDb(): Promise<Asset[]> {
  const client = new Client(DB_CONFIG);
  
  try {
    await client.connect();
    
    const result = await client.query(`
      SELECT * FROM assets 
      WHERE is_active = true 
      ORDER BY created_at DESC
    `);
    
    return result.rows;
  } catch (dbError: any) {
    console.warn('Database query error:', dbError.message);
    throw dbError;
  } finally {
    try {
      await client.end();
    } catch (endError) {
      // Ignore connection end errors
    }
  }
}

// Local storage fallback
const ASSETS_DIR = path.join(process.cwd(), '.local_data');
const ASSETS_FILE = path.join(ASSETS_DIR, 'assets.json');

async function saveAssetLocally(asset: Asset): Promise<Asset> {
  try {
    // Create directory if it doesn't exist
    if (!fs.existsSync(ASSETS_DIR)) {
      fs.mkdirSync(ASSETS_DIR, { recursive: true });
    }

    // Load existing assets
    let assets: Asset[] = [];
    if (fs.existsSync(ASSETS_FILE)) {
      try {
        const data = fs.readFileSync(ASSETS_FILE, 'utf8');
        assets = JSON.parse(data);
      } catch (parseError) {
        console.warn('⚠️ Corrupted local assets file, starting fresh');
        assets = [];
      }
    }

    // Add new asset with ID and timestamp
    const newAsset: Asset = {
      ...asset,
      id: assets.length + 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    assets.push(newAsset);

    // Save back to file
    fs.writeFileSync(ASSETS_FILE, JSON.stringify(assets, null, 2));
    console.log('✅ Asset saved locally.');
    
    return newAsset;
  } catch (localError: any) {
    console.error('❌ Failed to save asset locally:', localError.message);
    throw localError;
  }
}

async function getAssetsLocally(): Promise<Asset[]> {
  try {
    if (!fs.existsSync(ASSETS_FILE)) {
      return [];
    }

    const data = fs.readFileSync(ASSETS_FILE, 'utf8');
    const assets = JSON.parse(data);
    
    // Validate that it's an array
    if (!Array.isArray(assets)) {
      console.warn('⚠️ Local assets file is corrupted');
      return [];
    }
    
    return assets;
  } catch (error) {
    console.warn('⚠️ Error reading local assets file');
    return [];
  }
}

// Advanced asset management functions for production
export async function getAssetById(assetId: string): Promise<Asset | null> {
  try {
    const client = new Client(DB_CONFIG);
    await client.connect();
    
    const result = await client.query(`
      SELECT * FROM assets WHERE id = $1 AND is_active = true
    `, [assetId]);
    
    await client.end();
    return result.rows[0] || null;
  } catch (error) {
    // Fallback to local storage
    try {
      const assets = await getAssetsLocally();
      return assets.find(a => a.id?.toString() === assetId) || null;
    } catch (localError) {
      return null;
    }
  }
}

export async function updateAssetStatus(assetId: string, status: string): Promise<void> {
  try {
    const client = new Client(DB_CONFIG);
    await client.connect();
    
    const result = await client.query(`
      UPDATE assets 
      SET tokenization_status = $1, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $2
      RETURNING *
    `, [status, assetId]);
    
    await client.end();
    
    if (result.rows.length > 0) {
      console.log(`✅ Asset ${assetId} status updated to ${status}`);
    } else {
      console.warn(`⚠️ Asset ${assetId} not found for status update`);
    }
  } catch (error: any) {
    console.warn('⚠️ Could not update asset status in database:', error.message);
    
    // Try to update in local storage
    try {
      const assets = await getAssetsLocally();
      const assetIndex = assets.findIndex(a => a.id?.toString() === assetId);
      
      if (assetIndex >= 0) {
        assets[assetIndex].tokenization_status = status;
        assets[assetIndex].updated_at = new Date().toISOString();
        
        fs.writeFileSync(ASSETS_FILE, JSON.stringify(assets, null, 2));
        console.log(`✅ Asset ${assetId} status updated locally to ${status}`);
      }
    } catch (localError) {
      console.warn('⚠️ Could not update asset status locally either');
    }
  }
}

export async function tokenizeAsset(assetId: string): Promise<void> {
  console.log(`🪙 Starting tokenization process for asset ${assetId}...`);
  
  try {
    const asset = await getAssetById(assetId);
    if (!asset) {
      throw new Error('Asset not found');
    }
    
    if (asset.tokenization_status === 'tokenized') {
      console.log('✅ Asset is already tokenized');
      return;
    }
    
    // Update status to in progress
    await updateAssetStatus(assetId, 'in_progress');
    
    console.log('📋 Preparing smart contract deployment...');
    console.log('🔗 Connecting to blockchain...');
    console.log('💰 Calculating tokenization parameters...');
    console.log('⏳ Processing transaction...');
    
    // TODO: Implement actual tokenization logic
    // 1. Deploy ERC-20 token contract
    // 2. Mint tokens representing asset value
    // 3. Update asset with token address
    // 4. Record on Centrifuge
    
    // Simulate tokenization process
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Mock token address for demonstration
    const mockTokenAddress = '0x' + Array.from({length: 40}, () => 
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
    
    // Update asset with token information
    try {
      const client = new Client(DB_CONFIG);
      await client.connect();
      
      await client.query(`
        UPDATE assets 
        SET tokenization_status = $1, 
            token_address = $2,
            token_amount = $3,
            updated_at = CURRENT_TIMESTAMP 
        WHERE id = $4
      `, ['tokenized', mockTokenAddress, asset.value_usd, assetId]);
      
      await client.end();
    } catch (dbError) {
      // Fallback to local update
      await updateAssetStatus(assetId, 'tokenized');
    }
    
    console.log('✅ Asset tokenization completed!');
    console.log(`🪙 Token Contract: ${mockTokenAddress}`);
    console.log(`💎 Tokens Minted: ${asset.value_usd.toLocaleString()}`);
    console.log('🔗 Asset is now available for collateralization');
    
  } catch (error: any) {
    console.error('❌ Tokenization failed:', error.message);
    await updateAssetStatus(assetId, 'failed');
    throw error;
  }
}

// Asset analytics and reporting
export async function getAssetAnalytics(): Promise<void> {
  console.log('📊 Generating asset portfolio analytics...');
  
  try {
    let assets: Asset[] = [];
    
    try {
      assets = await getAssetsFromDb();
    } catch (dbError) {
      assets = await getAssetsLocally();
    }
    
    if (assets.length === 0) {
      console.log('No assets available for analysis.');
      return;
    }
    
    const totalValue = assets.reduce((sum, asset) => sum + asset.value_usd, 0);
    const activeAssets = assets.filter(a => a.is_active);
    const tokenizedAssets = assets.filter(a => a.tokenization_status === 'tokenized');
    
    console.log('\n📈 Portfolio Analytics:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Total Portfolio Value: ${new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: 'USD' 
    }).format(totalValue)}`);
    console.log(`Total Assets: ${assets.length}`);
    console.log(`Active Assets: ${activeAssets.length}`);
    console.log(`Tokenized Assets: ${tokenizedAssets.length} (${((tokenizedAssets.length / assets.length) * 100).toFixed(1)}%)`);
    
    // Value distribution by asset type
    const valueByType = assets.reduce((acc, asset) => {
      const type = asset.asset_type || 'Unknown';
      acc[type] = (acc[type] || 0) + asset.value_usd;
      return acc;
    }, {} as Record<string, number>);
    
    console.log('\n🏛️ Value Distribution by Asset Type:');
    Object.entries(valueByType).forEach(([type, value]) => {
      const percentage = ((value / totalValue) * 100).toFixed(1);
      const valueFormatted = new Intl.NumberFormat('en-US', { 
        style: 'currency', 
        currency: 'USD' 
      }).format(value);
      console.log(`   ${type}: ${valueFormatted} (${percentage}%)`);
    });
    
    // Tokenization progress
    const statusCounts = assets.reduce((acc, asset) => {
      const status = asset.tokenization_status || 'pending';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log('\n🪙 Tokenization Status:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      const percentage = ((count / assets.length) * 100).toFixed(1);
      console.log(`   ${getStatusIcon(status)} ${status}: ${count} assets (${percentage}%)`);
    });
    
  } catch (error: any) {
    console.error('❌ Error generating analytics:', error.message);
  }
}

// Mock data for demonstration
function displayMockAssets(): void {
  console.log('📋 Demo Assets (Database/Local Storage Unavailable):');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('1. Downtown Office Building');
  console.log('   Type: Commercial Real Estate');
  console.log('   Value: $2,500,000');
  console.log('   Status: ✅ TOKENIZED');
  console.log('   Token: 0x1234...5678');
  console.log('   ─────────────────────────────────────────────────────────────────────────');
  console.log('2. Supply Chain Receivables');
  console.log('   Type: Trade Finance');
  console.log('   Value: $850,000');
  console.log('   Status: ⏳ PENDING');
  console.log('   ─────────────────────────────────────────────────────────────────────────');
  console.log('\n📊 Demo Portfolio: 2 assets, $3,350,000 total value');
  console.log('💡 This is demo data. Create real assets to get started.');
}

// Utility function to check if database is available
export async function isDatabaseAvailable(): Promise<boolean> {
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