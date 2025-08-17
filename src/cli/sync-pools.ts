import { centrifuge } from '../utils/centrifuge';
import { query, closeDb } from '../utils/db';

export async function syncPools() {
  console.log('🔄 Fetching pools from Centrifuge...');
  
  try {
    const pools = await centrifuge.pools(); // Query SDK for all pools
    const poolList = Array.isArray(pools) ? pools : [pools];

    for (const pool of poolList) {
      console.log(`📦 Syncing pool ${pool.id} - ${pool.metadata?.name || 'Unnamed'}`);

      await query(
        `
        INSERT INTO pools (id, name, currency, metadata)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id)
        DO UPDATE SET name = EXCLUDED.name, currency = EXCLUDED.currency, metadata = EXCLUDED.metadata
        `,
        [
          pool.id,
          pool.metadata?.name || null,
          pool.currency || null,
          JSON.stringify(pool.metadata || {}),
        ]
      );
    }

    console.log('✅ Pools synced successfully.');
  } catch (err) {
    console.error('❌ Error syncing pools:', err);
  } finally {
    await closeDb();
  }
}

// Allow running from CLI directly
if (require.main === module) {
  syncPools();
}
