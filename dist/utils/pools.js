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
export async function listPools() {
    console.log('🏊 Listing available pools...');
    try {
        const pools = await getPoolsFromDatabase();
        if (pools.length > 0) {
            displayPools(pools);
            return;
        }
        await syncPoolsFromCentrifuge();
        const syncedPools = await getPoolsFromDatabase();
        if (syncedPools.length > 0) {
            displayPools(syncedPools);
        }
        else {
            displayMockPools();
        }
    }
    catch (error) {
        console.error('❌ Error fetching pools:', error);
        displayMockPools();
    }
}
async function getPoolsFromDatabase() {
    const client = new Client(DB_CONFIG);
    try {
        await client.connect();
        const result = await client.query(`
      SELECT * FROM pools 
      WHERE is_active = true 
      ORDER BY total_value_locked DESC
    `);
        return result.rows;
    }
    catch (error) {
        console.warn('⚠️ Database not available, using fallback...');
        return [];
    }
    finally {
        await client.end();
    }
}
async function syncPoolsFromCentrifuge() {
    try {
        console.log('🔄 Syncing pools from Centrifuge...');
        const CentrifugeModule = await import('@centrifuge/sdk');
        let centrifuge;
        const environment = (process.env.CENTRIFUGE_NETWORK === 'testnet') ? 'testnet' : 'mainnet';
        if (CentrifugeModule.Centrifuge) {
            centrifuge = new CentrifugeModule.Centrifuge({
                environment: environment
            });
        }
        else if (CentrifugeModule.default) {
            centrifuge = new CentrifugeModule.default({
                environment: environment
            });
        }
        else {
            throw new Error('Centrifuge SDK not properly configured');
        }
        let pools = [];
        if (centrifuge.pools) {
            pools = await centrifuge.pools.getAll();
        }
        else if (centrifuge.pool) {
            if (centrifuge.pool.getAll) {
                pools = await centrifuge.pool.getAll();
            }
            else if (centrifuge.pool.list) {
                pools = await centrifuge.pool.list();
            }
        }
        if (pools.length > 0) {
            await savePoolsToDatabase(pools);
            console.log(`✅ Synced ${pools.length} pools from Centrifuge`);
        }
    }
    catch (error) {
        console.warn('⚠️ Centrifuge sync failed:', error.message || error);
        throw error;
    }
}
async function savePoolsToDatabase(pools) {
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
    }
    finally {
        await client.end();
    }
}
function displayPools(pools) {
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
function displayMockPools() {
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
export async function getPoolDetails(poolId) {
    const client = new Client(DB_CONFIG);
    try {
        await client.connect();
        const result = await client.query(`
      SELECT * FROM pools 
      WHERE centrifuge_pool_id = $1 AND is_active = true
    `, [poolId]);
        return result.rows[0] || null;
    }
    finally {
        await client.end();
    }
}
export async function investInPool(poolId, amount, userId) {
    console.log(`📈 Initiating investment: $${amount} into pool ${poolId} for user ${userId}`);
    throw new Error('Investment functionality will be implemented with Centrifuge SDK');
}
