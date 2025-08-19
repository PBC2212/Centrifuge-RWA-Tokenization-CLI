// src/utils/db.ts
import { Client, Pool, PoolClient } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

// Database connection configuration
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'centrifuge_rwa',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  max: 20
};

// Create a connection pool for better performance
let dbPool: Pool | null = null;

export function getDbPool(): Pool {
  if (!dbPool) {
    dbPool = new Pool(DB_CONFIG);
    
    // Handle pool errors
    dbPool.on('error', (err) => {
      console.error('❌ Database pool error:', err.message);
    });
    
    dbPool.on('connect', () => {
      console.log('🔗 Database connection established');
    });
  }
  
  return dbPool;
}

export async function checkDb(): Promise<void> {
  console.log('🗃️ Checking database connection...');
  
  const client = new Client(DB_CONFIG);
  
  try {
    // Connect to database with timeout
    console.log('🔄 Attempting database connection...');
    await client.connect();
    console.log('✅ Database connection successful!');
    
    // Test basic connectivity
    const result = await client.query('SELECT NOW() as current_time, version() as db_version');
    const dbTime = result.rows[0].current_time;
    const dbVersion = result.rows[0].db_version;
    
    console.log('🕐 Database time:', dbTime);
    console.log('📊 Database version:', dbVersion.split(' ')[0]);
    
    // Check database configuration
    await checkDatabaseConfig(client);
    
    // Check if required tables exist
    await checkRequiredTables(client);
    
    // Check table schemas
    await validateTableSchemas(client);
    
    // Check database permissions
    await checkDatabasePermissions(client);
    
    // Test database performance
    await testDatabasePerformance(client);
    
    console.log('✅ Database health check completed successfully!');
    
  } catch (error: any) {
    console.error('❌ Database connection failed:');
    
    // Enhanced error handling with specific recommendations
    if (error.code === 'ECONNREFUSED') {
      console.error('   → Database server is not running or unreachable');
      console.error('   → Check if PostgreSQL is installed and running');
      console.error(`   → Trying to connect to: ${DB_CONFIG.host}:${DB_CONFIG.port}`);
      console.error('   → Try: sudo systemctl start postgresql (Linux) or brew services start postgresql (macOS)');
    } else if (error.code === '3D000') {
      console.error(`   → Database "${DB_CONFIG.database}" does not exist`);
      console.error('   → Create the database first:');
      console.error(`   → createdb ${DB_CONFIG.database}`);
    } else if (error.code === '28P01') {
      console.error('   → Authentication failed');
      console.error('   → Check username and password in environment variables');
      console.error('   → Verify PostgreSQL user permissions');
    } else if (error.code === '28000') {
      console.error('   → Invalid authorization specification');
      console.error('   → Check if user has permission to connect to database');
    } else if (error.code === 'ENOTFOUND') {
      console.error('   → Database host not found');
      console.error(`   → Check if host "${DB_CONFIG.host}" is correct`);
    } else if (error.code === 'ETIMEDOUT') {
      console.error('   → Connection timeout');
      console.error('   → Database server may be overloaded or network issues');
    } else {
      console.error('   →', error.message);
      if (error.code) {
        console.error(`   → Error code: ${error.code}`);
      }
    }
    
    console.log('\n🔧 Database Configuration:');
    console.log(`   Host: ${DB_CONFIG.host}`);
    console.log(`   Port: ${DB_CONFIG.port}`);
    console.log(`   Database: ${DB_CONFIG.database}`);
    console.log(`   User: ${DB_CONFIG.user}`);
    console.log('   Password: [hidden]');
    console.log(`   SSL: ${DB_CONFIG.ssl ? 'enabled' : 'disabled'}`);
    
    console.log('\n💡 Troubleshooting Steps:');
    console.log('   1. Verify PostgreSQL is running');
    console.log('   2. Check connection parameters in .env file');
    console.log('   3. Ensure database and user exist');
    console.log('   4. Verify network connectivity');
    console.log('   5. Check firewall settings');
    
    throw error;
  } finally {
    try {
      await client.end();
    } catch (endError) {
      // Ignore connection end errors
    }
  }
}

async function checkDatabaseConfig(client: Client): Promise<void> {
  try {
    console.log('⚙️ Checking database configuration...');
    
    const configQueries = [
      "SELECT current_setting('max_connections') as max_connections",
      "SELECT current_setting('shared_buffers') as shared_buffers",
      "SELECT current_setting('effective_cache_size') as effective_cache_size"
    ];
    
    for (const query of configQueries) {
      const result = await client.query(query);
      const setting = Object.keys(result.rows[0])[0];
      const value = result.rows[0][setting];
      console.log(`   ${setting}: ${value}`);
    }
    
  } catch (error: any) {
    console.warn('⚠️ Could not check database configuration:', error.message);
  }
}

async function checkRequiredTables(client: Client): Promise<void> {
  try {
    console.log('📋 Checking required tables...');
    
    const tableCheck = await client.query(`
      SELECT table_name, table_type
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('assets', 'positions', 'users', 'pools')
      ORDER BY table_name;
    `);
    
    const existingTables = tableCheck.rows.map(row => row.table_name);
    const requiredTables = ['assets', 'positions', 'users', 'pools'];
    const missingTables = requiredTables.filter(table => !existingTables.includes(table));
    
    if (missingTables.length > 0) {
      console.log('⚠️ Missing tables:', missingTables.join(', '));
      console.log('🔧 Run database migrations to create required tables');
      console.log('   → Use: npm run db:migrate (if available)');
      console.log('   → Or manually create tables using SQL scripts');
    } else {
      console.log('✅ All required tables exist');
    }
    
    // Show table sizes
    if (existingTables.length > 0) {
      console.log('📊 Table information:');
      for (const table of existingTables) {
        const sizeQuery = await client.query(`
          SELECT 
            schemaname,
            tablename,
            attname,
            n_distinct,
            correlation
          FROM pg_stats 
          WHERE tablename = $1 
          LIMIT 5
        `, [table]);
        
        const countQuery = await client.query(`SELECT COUNT(*) as row_count FROM ${table}`);
        const rowCount = countQuery.rows[0].row_count;
        
        console.log(`   ${table}: ${rowCount} rows`);
      }
    }
    
  } catch (error: any) {
    console.warn('⚠️ Could not check table information:', error.message);
  }
}

async function validateTableSchemas(client: Client): Promise<void> {
  try {
    console.log('🔍 Validating table schemas...');
    
    const schemaQueries = {
      users: `
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'users' AND table_schema = 'public'
        ORDER BY ordinal_position
      `,
      assets: `
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'assets' AND table_schema = 'public'
        ORDER BY ordinal_position
      `
    };
    
    for (const [tableName, query] of Object.entries(schemaQueries)) {
      try {
        const result = await client.query(query);
        if (result.rows.length > 0) {
          console.log(`   ✅ ${tableName} schema validated (${result.rows.length} columns)`);
        }
      } catch (schemaError) {
        console.log(`   ⚠️ ${tableName} table may need schema updates`);
      }
    }
    
  } catch (error: any) {
    console.warn('⚠️ Could not validate schemas:', error.message);
  }
}

async function checkDatabasePermissions(client: Client): Promise<void> {
  try {
    console.log('🔐 Checking database permissions...');
    
    // Check if user can create tables
    try {
      await client.query('CREATE TABLE IF NOT EXISTS _permission_test (id SERIAL PRIMARY KEY)');
      await client.query('DROP TABLE IF EXISTS _permission_test');
      console.log('   ✅ CREATE/DROP permissions: OK');
    } catch (createError) {
      console.log('   ⚠️ CREATE/DROP permissions: LIMITED');
    }
    
    // Check if user can read/write
    try {
      await client.query('SELECT 1');
      console.log('   ✅ SELECT permissions: OK');
    } catch (selectError) {
      console.log('   ❌ SELECT permissions: FAILED');
    }
    
  } catch (error: any) {
    console.warn('⚠️ Could not check permissions:', error.message);
  }
}

async function testDatabasePerformance(client: Client): Promise<void> {
  try {
    console.log('⚡ Testing database performance...');
    
    const startTime = Date.now();
    
    // Simple performance test
    await client.query('SELECT generate_series(1, 1000) as test_data');
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`   Query performance: ${duration}ms`);
    
    if (duration > 1000) {
      console.log('   ⚠️ Database may be slow - consider optimization');
    } else {
      console.log('   ✅ Database performance: Good');
    }
    
  } catch (error: any) {
    console.warn('⚠️ Could not test performance:', error.message);
  }
}

// Database initialization and migration functions
export async function initializeDatabase(): Promise<void> {
  console.log('🚀 Initializing database...');
  
  const client = new Client(DB_CONFIG);
  
  try {
    await client.connect();
    
    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        wallet_address VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255),
        kyc_status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create assets table
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
        wallet_address VARCHAR(255) NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create positions table
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
    
    // Create pools table
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
    
    // Create indexes for better performance
    await client.query('CREATE INDEX IF NOT EXISTS idx_users_wallet_address ON users(wallet_address)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_assets_user_id ON assets(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_assets_tokenization_status ON assets(tokenization_status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_positions_user_id ON positions(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_pools_status ON pools(pool_status)');
    
    console.log('✅ Database initialization completed successfully!');
    
  } catch (error: any) {
    console.error('❌ Database initialization failed:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

// Connection testing utilities
export async function testDatabaseConnection(): Promise<{
  connected: boolean;
  responseTime: number;
  version?: string;
  error?: string;
}> {
  const startTime = Date.now();
  const client = new Client(DB_CONFIG);
  
  try {
    await client.connect();
    const result = await client.query('SELECT version() as version');
    const responseTime = Date.now() - startTime;
    
    return {
      connected: true,
      responseTime,
      version: result.rows[0].version.split(' ')[0]
    };
    
  } catch (error: any) {
    return {
      connected: false,
      responseTime: Date.now() - startTime,
      error: error.message
    };
  } finally {
    try {
      await client.end();
    } catch (endError) {
      // Ignore connection end errors
    }
  }
}

// Pool connection management
export async function closeDatabasePool(): Promise<void> {
  if (dbPool) {
    await dbPool.end();
    dbPool = null;
    console.log('🔒 Database connection pool closed');
  }
}

// Health check for monitoring
export async function getDatabaseHealth(): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  connections: {
    total: number;
    idle: number;
    waiting: number;
  };
  metrics: {
    totalConnections: number;
    idleConnections: number;
    waitingClients: number;
  };
}> {
  try {
    const pool = getDbPool();
    
    return {
      status: 'healthy',
      connections: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount
      },
      metrics: {
        totalConnections: pool.totalCount,
        idleConnections: pool.idleCount,
        waitingClients: pool.waitingCount
      }
    };
    
  } catch (error) {
    return {
      status: 'unhealthy',
      connections: { total: 0, idle: 0, waiting: 0 },
      metrics: { totalConnections: 0, idleConnections: 0, waitingClients: 0 }
    };
  }
}

// Export database configuration for other modules
export { DB_CONFIG };