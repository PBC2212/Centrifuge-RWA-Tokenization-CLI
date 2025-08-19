import dotenv from 'dotenv';
import pkg from 'pg';
const { Client } = pkg;

dotenv.config();

const client = new Client({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true'
});

async function testConnection() {
  try {
    await client.connect();
    console.log("✅ Connected to DB");
    const res = await client.query('SELECT * FROM healthcheck;');
    console.log("📊 Healthcheck table:", res.rows);
  } catch (err) {
    console.error("❌ DB connection failed:", err.message);
  } finally {
    await client.end();
  }
}

testConnection();
