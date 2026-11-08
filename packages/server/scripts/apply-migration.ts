/**
 * Applies scripts/seed.sql to the Supabase project via the Management API.
 *
 * Usage:
 *   set SUPABASE_ACCESS_TOKEN=sbp_...   (PowerShell: $env:SUPABASE_ACCESS_TOKEN="sbp_...")
 *   npx tsx scripts/apply-migration.ts
 *
 * The token is a Personal Access Token from
 * https://supabase.com/dashboard/account/tokens
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

const PROJECT_REF = 'vonkqyiczeqhuqhahsxm';
const token = process.env.SUPABASE_ACCESS_TOKEN;

if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN is not set.');
  process.exit(1);
}

const sqlPath = path.resolve('scripts/seed.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');
console.log(`Applying ${sqlPath} (${sql.length} chars) to ${PROJECT_REF}...`);

async function api(pathname: string, init?: RequestInit) {
  const res = await fetch(`https://api.supabase.com${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* keep text */
  }
  return { ok: res.ok, status: res.status, body };
}

async function main() {
  const run = await api(`/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    body: JSON.stringify({ query: sql }),
  });

  if (!run.ok) {
    console.error('Migration failed:', run.status, JSON.stringify(run.body, null, 2));
    process.exit(1);
  }

  console.log('Migration applied. Response:', JSON.stringify(run.body).slice(0, 300));

  const verify = await api(`/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    body: JSON.stringify({
      query: `select table_name from information_schema.tables
              where table_schema = 'public' and table_name like 'sp\\_%'
              order by table_name;`,
    }),
  });

  if (!verify.ok) {
    console.error('Verification query failed:', verify.status, JSON.stringify(verify.body, null, 2));
    process.exit(1);
  }

  const rows = Array.isArray(verify.body) ? (verify.body as any[]) : [];
  console.log(`\nsp_* tables now in public schema (${rows.length}):`);
  for (const row of rows) console.log(`  - ${row.table_name}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
