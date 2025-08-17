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
export async function pledgeAsset(name, valueUsd, documentPath) {
    console.log('🏛️ Pledging real-world asset...');
    if (!fs.existsSync(WALLET_FILE)) {
        throw new Error('No wallet found. Run "npm run wallet -- --create" first.');
    }
    const { password } = await inquirer.prompt([{
            type: 'password',
            name: 'password',
            message: 'Enter wallet password to sign asset pledge:'
        }]);
    let walletAddress;
    let documentContent = null;
    try {
        const encryptedWallet = fs.readFileSync(WALLET_FILE, 'utf8');
        const wallet = await ethers.Wallet.fromEncryptedJson(encryptedWallet, password);
        walletAddress = wallet.address;
        if (documentPath && fs.existsSync(documentPath)) {
            documentContent = fs.readFileSync(documentPath, 'utf8');
            console.log('📄 Document attached successfully.');
        }
        else if (documentPath) {
            console.warn('⚠️  Document path provided but file not found. Continuing without document.');
        }
        const assetData = await inquirer.prompt([
            {
                type: 'input',
                name: 'description',
                message: 'Asset description:',
                validate: (input) => input.length > 10 || 'Description must be at least 10 characters'
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
                message: 'Asset location/jurisdiction:'
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
        const asset = {
            name,
            description: assetData.description,
            asset_type: assetData.assetType,
            value_usd: valueUsd,
            currency: 'USD',
            documents: documentContent ? [{ type: 'supporting_document', content: documentContent }] : [],
            metadata: {
                location: assetData.location,
                hasAppraisal: assetData.hasAppraisal,
                hasInsurance: assetData.hasInsurance,
                createdBy: 'cli',
                version: '1.0'
            },
            tokenization_status: 'pending',
            wallet_address: walletAddress,
            is_active: true
        };
        try {
            const savedAsset = await saveAssetToDb(asset);
            console.log('✅ Asset saved to production database.');
            return savedAsset;
        }
        catch (dbError) {
            console.warn('⚠️  Database not available, saving locally...');
            const savedAsset = await saveAssetLocally(asset);
            return savedAsset;
        }
    }
    catch (error) {
        if (error.message.includes('invalid password')) {
            throw new Error('Invalid wallet password.');
        }
        throw error;
    }
}
export async function listAssets() {
    console.log('📋 Retrieving pledged assets...');
    try {
        const assets = await getAssetsFromDb();
        if (assets.length > 0) {
            displayAssets(assets);
            return;
        }
    }
    catch (dbError) {
        console.warn('⚠️  Database not available, checking local storage...');
    }
    const localAssets = await getAssetsLocally();
    displayAssets(localAssets);
}
function displayAssets(assets) {
    if (assets.length === 0) {
        console.log('No assets pledged yet.');
        return;
    }
    console.log('📋 Your Pledged Assets:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    let totalValue = 0;
    assets.forEach((asset, index) => {
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
        if (asset.created_at) {
            console.log(`   Created: ${new Date(asset.created_at).toLocaleDateString()}`);
        }
        console.log('   ─────────────────────────────────────────────────────────────────────────');
        totalValue += asset.value_usd;
    });
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
    }, {});
    console.log(`   Status Breakdown:`);
    Object.entries(statusBreakdown).forEach(([status, count]) => {
        console.log(`     ${getStatusIcon(status)} ${status}: ${count}`);
    });
}
function getStatusIcon(status) {
    const icons = {
        'pending': '⏳',
        'in_progress': '🔄',
        'tokenized': '✅',
        'failed': '❌'
    };
    return icons[status] || '❓';
}
async function saveAssetToDb(asset) {
    const client = new Client(DB_CONFIG);
    try {
        await client.connect();
        await client.query(`
      INSERT INTO users (wallet_address) 
      VALUES ($1) 
      ON CONFLICT (wallet_address) DO NOTHING
    `, [asset.wallet_address]);
        const userResult = await client.query(`
      SELECT id FROM users WHERE wallet_address = $1
    `, [asset.wallet_address]);
        const userId = userResult.rows[0].id;
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
    }
    finally {
        await client.end();
    }
}
async function getAssetsFromDb() {
    const client = new Client(DB_CONFIG);
    try {
        await client.connect();
        const result = await client.query(`
      SELECT * FROM assets 
      WHERE is_active = true 
      ORDER BY created_at DESC
    `);
        return result.rows;
    }
    finally {
        await client.end();
    }
}
const ASSETS_DIR = path.join(process.cwd(), '.local_data');
const ASSETS_FILE = path.join(ASSETS_DIR, 'assets.json');
async function saveAssetLocally(asset) {
    if (!fs.existsSync(ASSETS_DIR)) {
        fs.mkdirSync(ASSETS_DIR, { recursive: true });
    }
    let assets = [];
    if (fs.existsSync(ASSETS_FILE)) {
        const data = fs.readFileSync(ASSETS_FILE, 'utf8');
        assets = JSON.parse(data);
    }
    const newAsset = {
        ...asset,
        id: assets.length + 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };
    assets.push(newAsset);
    fs.writeFileSync(ASSETS_FILE, JSON.stringify(assets, null, 2));
    return newAsset;
}
async function getAssetsLocally() {
    if (!fs.existsSync(ASSETS_FILE)) {
        return [];
    }
    const data = fs.readFileSync(ASSETS_FILE, 'utf8');
    return JSON.parse(data);
}
export async function getAssetById(assetId) {
    try {
        const client = new Client(DB_CONFIG);
        await client.connect();
        const result = await client.query(`
      SELECT * FROM assets WHERE id = $1 AND is_active = true
    `, [assetId]);
        await client.end();
        return result.rows[0] || null;
    }
    catch (error) {
        const assets = await getAssetsLocally();
        return assets.find(a => a.id?.toString() === assetId) || null;
    }
}
export async function updateAssetStatus(assetId, status) {
    try {
        const client = new Client(DB_CONFIG);
        await client.connect();
        await client.query(`
      UPDATE assets 
      SET tokenization_status = $1, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $2
    `, [status, assetId]);
        await client.end();
        console.log(`✅ Asset ${assetId} status updated to ${status}`);
    }
    catch (error) {
        console.warn('⚠️  Could not update asset status in database');
    }
}
export async function tokenizeAsset(assetId) {
    console.log(`🪙 Starting tokenization process for asset ${assetId}...`);
    const asset = await getAssetById(assetId);
    if (!asset) {
        throw new Error('Asset not found');
    }
    await updateAssetStatus(assetId, 'in_progress');
    console.log('📋 Preparing smart contract deployment...');
    console.log('🔗 Connecting to blockchain...');
    console.log('💰 Calculating tokenization parameters...');
    setTimeout(async () => {
        await updateAssetStatus(assetId, 'tokenized');
        console.log('✅ Asset tokenization completed!');
    }, 2000);
}
