import 'dotenv/config';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

const PROJECT_REF = 'vonkqyiczeqhuqhahsxm';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

if (!SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_KEY not found in .env');
  process.exit(1);
}

// Supabase direct PostgreSQL connection string
const connectionString = `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(SERVICE_KEY)}@db.${PROJECT_REF}.supabase.co:5432/postgres`;

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const client = await pool.connect();
  try {
    // Read the migration SQL
    const sql = fs.readFileSync(path.resolve('scripts/seed.sql'), 'utf8');

    // Split by semicolons and execute each statement
    const statements = sql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'));

    console.log(`Executing ${statements.length} SQL statements...`);

    for (const stmt of statements) {
      try {
        await client.query(stmt);
        const firstLine = stmt.split('\n')[0].trim();
        console.log(`  ✓ ${firstLine.substring(0, 80)}${firstLine.length > 80 ? '...' : ''}`);
      } catch (err: any) {
        // Skip errors for IF NOT EXISTS statements and other expected issues
        if (err.message?.includes('already exists') || err.message?.includes('does not exist')) {
          console.log(`  ⚠ ${err.message.substring(0, 80)}`);
        } else {
          console.error(`  ✗ Error: ${err.message.substring(0, 200)}`);
        }
      }
    }

    // Verify tables were created
    const { rows } = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE 'sp_%'
      ORDER BY table_name
    `);
    
    console.log('\nSmartPredict tables in Supabase:');
    rows.forEach((r: any) => console.log(`  - ${r.table_name}`));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
