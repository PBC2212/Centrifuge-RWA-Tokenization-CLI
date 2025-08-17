import { Client } from 'pg';
const DB_CONFIG = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'centrifuge_rwa',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
};
export async function checkDb() {
    console.log('🗃️  Checking database connection...');
    const client = new Client(DB_CONFIG);
    try {
        await client.connect();
        console.log('✅ Database connection successful!');
        const tableCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('assets', 'pledges', 'users');
    `);
        const existingTables = tableCheck.rows.map(row => row.table_name);
        const requiredTables = ['assets', 'pledges', 'users'];
        const missingTables = requiredTables.filter(table => !existingTables.includes(table));
        if (missingTables.length > 0) {
            console.log('⚠️  Missing tables:', missingTables.join(', '));
            console.log('🔧 Run database migrations to create required tables.');
        }
        else {
            console.log('✅ All required tables exist.');
        }
        const result = await client.query('SELECT NOW() as current_time');
        console.log('🕒 Database time:', result.rows[0].current_time);
    }
    catch (error) {
        console.error('❌ Database connection failed:');
        if (error.code === 'ECONNREFUSED') {
            console.error('   → Database server is not running or unreachable');
            console.error('   → Check if PostgreSQL is installed and running');
            console.error(`   → Trying to connect to: ${DB_CONFIG.host}:${DB_CONFIG.port}`);
        }
        else if (error.code === '3D000') {
            console.error(`   → Database "${DB_CONFIG.database}" does not exist`);
            console.error('   → Create the database first');
        }
        else if (error.code === '28P01') {
            console.error('   → Authentication failed');
            console.error('   → Check username and password');
        }
        else {
            console.error('   →', error.message);
        }
        console.log('\n📝 Database Configuration:');
        console.log(`   Host: ${DB_CONFIG.host}`);
        console.log(`   Port: ${DB_CONFIG.port}`);
        console.log(`   Database: ${DB_CONFIG.database}`);
        console.log(`   User: ${DB_CONFIG.user}`);
        console.log('   Password: [hidden]');
        throw error;
    }
    finally {
        await client.end();
    }
}
