// src/utils/pools.ts
import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'centrifuge_rwa',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
};

export interface Pool {
  id: string;
  centrifuge_pool_id: string;
  name: string;
  description?: string;
  asset_class: string;
  total_value_locked: number;
  apy: number;
  currency: string;
  minimum_investment: number;
  maximum_investment: number;
  pool_status: string;
  metadata: any;
}

export async function listPools(): Promise<void> {
  console.log('🏊 Listing available pools...');
  
  try {
    // First try to get pools from database
    const pools = await getPoolsFromDatabase();
    
    if (pools.length > 0) {
      displayPools(pools);
      return;
    }
    
    // Fallback to Centrifuge SDK
    await syncPoolsFromCentrifuge();
    const syncedPools = await getPoolsFromDatabase();
    
    if (syncedPools.length > 0) {
      displayPools(syncedPools);
    } else {
      displayMockPools();
    }
    
  } catch (error) {
    console.error('❌ Error fetching pools:', error);
    displayMockPools();
  }
}

async function getPoolsFromDatabase(): Promise<Pool[]> {
  const client = new Client(DB_CONFIG);
  
  try {
    await client.connect();
    
    const result = await client.query(`
      SELECT * FROM pools 
      WHERE is_active = true 
      ORDER BY total_value_locked DESC
    `);
    
    return result.rows;
  } catch (error) {
    console.warn('⚠️ Database not available, using fallback...');
    return [];
  } finally {
    await client.end();
  }
}

async function syncPoolsFromCentrifuge(): Promise<void> {
  try {
    console.log('🔄 Syncing pools from Centrifuge...');
    
    // Try different import patterns for Centrifuge SDK
    const CentrifugeModule = await import('@centrifuge/sdk');
    let centrifuge;

    if (CentrifugeModule.CentrifugeSDK) {
      centrifuge = new CentrifugeModule.CentrifugeSDK({
        network: process.env.CENTRIFUGE_NETWORK || 'centrifuge',
        rpcUrl: process.env.CENTRIFUGE_RPC_URL
      });
    } else if (CentrifugeModule.default) {
      centrifuge = new CentrifugeModule.default({
        network: process.env.CENTRIFUGE_NETWORK || 'centrifuge',
        rpcUrl: process.env.CENTRIFUGE_RPC_URL
      });
    } else {
      throw new Error('Centrifuge SDK not properly configured');
    }

    // Attempt different API methods
    let pools = [];
    if (centrifuge.pools) {
      pools = await centrifuge.pools.getAll();
    } else if (centrifuge.pool) {
      if (centrifuge.pool.getAll) {
        pools = await centrifuge.pool.getAll();
      } else if (centrifuge.pool.list) {
        pools = await centrifuge.pool.list();
      }
    }

    // Save pools to database
    if (pools.length > 0) {
      await savePoolsToDatabase(pools);
      console.log(`✅ Synced ${pools.length} pools from Centrifuge`);
    }
    
  } catch (error) {
    console.warn('⚠️ Centrifuge sync failed:', error.message);
    throw error;
  }
}

async function savePoolsToDatabase(pools: any[]): Promise<void> {
  const client = new Client(DB_CONFIG);
  
  try {
    await client.connect();
    
    for (const pool of pools) {
      await client.query(`
        INSERT INTO pools (
          centrifuge_pool_id, name, description, asset_class,
          total_value_locked, apy, currency, minimum_investment,
          maximum_investment, pool_status, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (centrifuge_pool_id) 
        DO UPDATE SET
          name = EXCLUDED.name,
          total_value_locked = EXCLUDED.total_value_locked,
          apy = EXCLUDED.apy,
          updated_at = CURRENT_TIMESTAMP
      `, [
        pool.id,
        pool.metadata?.name || 'Unknown Pool',
        pool.metadata?.description || '',
        pool.metadata?.assetClass || 'Mixed',
        pool.nav?.total || 0,
        pool.apy || 0,
        pool.currency || 'USD',
        pool.minInvestment || 1000,
        pool.maxInvestment || 10000000,
        pool.status || 'active',
        JSON.stringify(pool.metadata || {})
      ]);
    }
    
  } finally {
    await client.end();
  }
}

function displayPools(pools: Pool[]): void {
  console.log('📋 Available Investment Pools:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  pools.forEach((pool, index) => {
    const tvlFormatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: pool.currency
    }).format(pool.total_value_locked);
    
    const minInvestment = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: pool.currency
    }).format(pool.minimum_investment);

    console.log(`${index + 1}. ${pool.name}`);
    console.log(`   Pool ID: ${pool.centrifuge_pool_id}`);
    console.log(`   Asset Class: ${pool.asset_class}`);
    console.log(`   Total Value Locked: ${tvlFormatted}`);
    console.log(`   APY: ${pool.apy}%`);
    console.log(`   Minimum Investment: ${minInvestment}`);
    console.log(`   Status: ${pool.pool_status.toUpperCase()}`);
    if (pool.description) {
      console.log(`   Description: ${pool.description}`);
    }
    console.log('   ─────────────────────────────────────────────────────────────────────────');
  });
  
  console.log(`\n📊 Total Pools: ${pools.length}`);
  console.log(`💰 Combined TVL: ${new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(pools.reduce((sum, pool) => sum + pool.total_value_locked, 0))}`);
}

function displayMockPools(): void {
  console.log('📋 Demo Pools (Centrifuge Integration Pending):');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('1. Prime Real Estate Fund');
  console.log('   Pool ID: PREF-001');
  console.log('   Asset Class: Commercial Real Estate');
  console.log('   Total Value Locked: $15,500,000');
  console.log('   APY: 8.25%');
  console.log('   Minimum Investment: $10,000');
  console.log('   Status: ACTIVE');
  console.log('   ─────────────────────────────────────────────────────────────────────────');
  console.log('2. Trade Finance Pool');
  console.log('   Pool ID: TFP-002');
  console.log('   Asset Class: Trade Finance');
  console.log('   Total Value Locked: $8,200,000');
  console.log('   APY: 12.80%');
  console.log('   Minimum Investment: $5,000');
  console.log('   Status: ACTIVE');
  console.log('   ─────────────────────────────────────────────────────────────────────────');
  console.log('3. Supply Chain Finance');
  console.log('   Pool ID: SCF-003');
  console.log('   Asset Class: Receivables');
  console.log('   Total Value Locked: $12,750,000');
  console.log('   APY: 9.45%');
  console.log('   Minimum Investment: $2,500');
  console.log('   Status: ACTIVE');
  console.log('   ─────────────────────────────────────────────────────────────────────────');
  
  console.log(`\n💡 Note: Demo data shown. Configure Centrifuge SDK for live pools.`);
  console.log(`🚀 Going live in production environment soon!`);
}

// Pool interaction functions for production
export async function getPoolDetails(poolId: string): Promise<Pool | null> {
  const client = new Client(DB_CONFIG);
  
  try {
    await client.connect();
    
    const result = await client.query(`
      SELECT * FROM pools 
      WHERE centrifuge_pool_id = $1 AND is_active = true
    `, [poolId]);
    
    return result.rows[0] || null;
  } finally {
    await client.end();
  }
}

export async function investInPool(poolId: string, amount: number, userId: string): Promise<string> {
  // This will integrate with Centrifuge SDK for actual investment
  console.log(`📈 Initiating investment: $${amount} into pool ${poolId} for user ${userId}`);
  
  // TODO: Implement actual Centrifuge investment logic
  // 1. Validate user KYC status
  // 2. Check minimum investment requirements
  // 3. Execute blockchain transaction
  // 4. Record position in database
  
  throw new Error('Investment functionality will be implemented with Centrifuge SDK');
}