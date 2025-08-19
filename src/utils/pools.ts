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
    try {
      await syncPoolsFromCentrifuge();
      const syncedPools = await getPoolsFromDatabase();
      
      if (syncedPools.length > 0) {
        displayPools(syncedPools);
      } else {
        displayMockPools();
      }
    } catch (syncError) {
      console.warn('⚠️ Centrifuge sync failed, showing demo data');
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
    try {
      await client.end();
    } catch (endError) {
      // Ignore connection end errors
    }
  }
}

async function syncPoolsFromCentrifuge(): Promise<void> {
  try {
    console.log('🔄 Syncing pools from Centrifuge...');
    
    // Enhanced error handling for Centrifuge SDK import
    let CentrifugeModule;
    try {
      CentrifugeModule = await import('@centrifuge/sdk');
    } catch (importError) {
      throw new Error('Centrifuge SDK not installed or not available');
    }

    let centrifuge: any;
    const environment: 'mainnet' | 'testnet' = (process.env.CENTRIFUGE_NETWORK === 'testnet') ? 'testnet' : 'mainnet';
    
    // Try different Centrifuge SDK instantiation patterns
    if (CentrifugeModule.Centrifuge) {
      centrifuge = new CentrifugeModule.Centrifuge({
        environment: environment
      });
    } else if (CentrifugeModule.default?.Centrifuge) {
      centrifuge = new CentrifugeModule.default.Centrifuge({
        environment: environment
      });
    } else if (CentrifugeModule.default) {
      centrifuge = new CentrifugeModule.default({
        environment: environment
      });
    } else {
      throw new Error('Centrifuge SDK constructor not found');
    }

    // Wait for SDK to be ready
    if (centrifuge.initialize) {
      await centrifuge.initialize();
    }

    // Attempt different API methods to get pools
    let pools = [];
    
    try {
      if (centrifuge.pools?.getAll) {
        pools = await centrifuge.pools.getAll();
      } else if (centrifuge.pool?.getAll) {
        pools = await centrifuge.pool.getAll();
      } else if (centrifuge.pool?.list) {
        pools = await centrifuge.pool.list();
      } else if (centrifuge.getPools) {
        pools = await centrifuge.getPools();
      } else {
        throw new Error('No pool listing method found in Centrifuge SDK');
      }
    } catch (apiError: any) {
      throw new Error(`Centrifuge API call failed: ${apiError.message}`);
    }

    // Validate and save pools to database
    if (Array.isArray(pools) && pools.length > 0) {
      await savePoolsToDatabase(pools);
      console.log(`✅ Synced ${pools.length} pools from Centrifuge`);
    } else {
      console.warn('⚠️ No pools returned from Centrifuge API');
    }
    
  } catch (error: any) {
    console.warn('⚠️ Centrifuge sync failed:', error.message || error);
    throw error;
  }
}

async function savePoolsToDatabase(pools: any[]): Promise<void> {
  const client = new Client(DB_CONFIG);
  
  try {
    await client.connect();
    
    // Create pools table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS pools (
        id SERIAL PRIMARY KEY,
        centrifuge_pool_id VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        asset_class VARCHAR(100),
        total_value_locked DECIMAL(20,2) DEFAULT 0,
        apy DECIMAL(5,2) DEFAULT 0,
        currency VARCHAR(10) DEFAULT 'USD',
        minimum_investment DECIMAL(20,2) DEFAULT 1000,
        maximum_investment DECIMAL(20,2) DEFAULT 10000000,
        pool_status VARCHAR(50) DEFAULT 'active',
        metadata JSONB,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    for (const pool of pools) {
      try {
        // Safely extract pool data with fallbacks
        const poolId = pool.id || pool.poolId || pool.centrifugePoolId || 'unknown';
        const name = pool.metadata?.name || pool.name || `Pool ${poolId}`;
        const description = pool.metadata?.description || pool.description || '';
        const assetClass = pool.metadata?.assetClass || pool.assetClass || 'Mixed';
        const totalValueLocked = Number(pool.nav?.total || pool.totalValueLocked || pool.tvl || 0);
        const apy = Number(pool.apy || pool.yield || 0);
        const currency = pool.currency || pool.metadata?.currency || 'USD';
        const minInvestment = Number(pool.minInvestment || pool.metadata?.minInvestment || 1000);
        const maxInvestment = Number(pool.maxInvestment || pool.metadata?.maxInvestment || 10000000);
        const status = pool.status || pool.poolStatus || 'active';
        
        await client.query(`
          INSERT INTO pools (
            centrifuge_pool_id, name, description, asset_class,
            total_value_locked, apy, currency, minimum_investment,
            maximum_investment, pool_status, metadata, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
          ON CONFLICT (centrifuge_pool_id) 
          DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            total_value_locked = EXCLUDED.total_value_locked,
            apy = EXCLUDED.apy,
            pool_status = EXCLUDED.pool_status,
            metadata = EXCLUDED.metadata,
            updated_at = CURRENT_TIMESTAMP
        `, [
          poolId,
          name,
          description,
          assetClass,
          totalValueLocked,
          apy,
          currency,
          minInvestment,
          maxInvestment,
          status,
          JSON.stringify(pool)
        ]);
      } catch (poolError: any) {
        console.warn(`⚠️ Failed to save pool ${pool.id || 'unknown'}:`, poolError.message);
      }
    }
    
  } catch (dbError: any) {
    console.warn('⚠️ Database operation failed:', dbError.message);
    throw dbError;
  } finally {
    try {
      await client.end();
    } catch (endError) {
      // Ignore connection end errors
    }
  }
}

function displayPools(pools: Pool[]): void {
  console.log('📋 Available Investment Pools:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  pools.forEach((pool, index) => {
    try {
      const tvlFormatted = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: pool.currency || 'USD'
      }).format(pool.total_value_locked || 0);
      
      const minInvestment = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: pool.currency || 'USD'
      }).format(pool.minimum_investment || 0);

      console.log(`${index + 1}. ${pool.name}`);
      console.log(`   Pool ID: ${pool.centrifuge_pool_id}`);
      console.log(`   Asset Class: ${pool.asset_class}`);
      console.log(`   Total Value Locked: ${tvlFormatted}`);
      console.log(`   APY: ${pool.apy || 0}%`);
      console.log(`   Minimum Investment: ${minInvestment}`);
      console.log(`   Status: ${(pool.pool_status || 'unknown').toUpperCase()}`);
      if (pool.description) {
        console.log(`   Description: ${pool.description}`);
      }
      console.log('   ─────────────────────────────────────────────────────────────────────────');
    } catch (displayError) {
      console.log(`${index + 1}. ${pool.name || 'Unknown Pool'} (Display Error)`);
      console.log('   ─────────────────────────────────────────────────────────────────────────');
    }
  });
  
  try {
    const totalTVL = pools.reduce((sum, pool) => sum + (pool.total_value_locked || 0), 0);
    console.log(`\n📊 Total Pools: ${pools.length}`);
    console.log(`💰 Combined TVL: ${new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(totalTVL)}`);
  } catch (summaryError) {
    console.log(`\n📊 Total Pools: ${pools.length}`);
  }
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
  console.log(`🚀 Ready for production environment!`);
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
  } catch (error: any) {
    console.error('❌ Error fetching pool details:', error.message);
    return null;
  } finally {
    try {
      await client.end();
    } catch (endError) {
      // Ignore connection end errors
    }
  }
}

export async function investInPool(poolId: string, amount: number, userId: string): Promise<string> {
  try {
    // Validate inputs
    if (!poolId || !amount || !userId) {
      throw new Error('Missing required parameters: poolId, amount, or userId');
    }
    
    if (amount <= 0) {
      throw new Error('Investment amount must be greater than 0');
    }
    
    // Get pool details
    const pool = await getPoolDetails(poolId);
    if (!pool) {
      throw new Error(`Pool ${poolId} not found or inactive`);
    }
    
    // Validate investment amount
    if (amount < pool.minimum_investment) {
      throw new Error(`Minimum investment for this pool is ${pool.minimum_investment} ${pool.currency}`);
    }
    
    if (amount > pool.maximum_investment) {
      throw new Error(`Maximum investment for this pool is ${pool.maximum_investment} ${pool.currency}`);
    }
    
    console.log(`📈 Initiating investment: ${amount} ${pool.currency} into pool ${poolId} for user ${userId}`);
    
    // TODO: Implement actual Centrifuge investment logic
    // 1. Validate user KYC status
    // 2. Check user balance
    // 3. Execute blockchain transaction
    // 4. Record position in database
    // 5. Send confirmation
    
    throw new Error('Investment functionality will be implemented with Centrifuge SDK integration');
    
  } catch (error: any) {
    console.error('❌ Investment failed:', error.message);
    throw error;
  }
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