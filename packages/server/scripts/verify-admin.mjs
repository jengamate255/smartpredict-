// Verifies cancel + settlement end-to-end against a running server.
// Usage: node --env-file=.env scripts/verify-admin.mjs [baseUrl]
import { createClient } from '@supabase/supabase-js';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const TRADER = '255700000011';
const ADMIN = '255700000012';

async function call(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

function check(label, ok, extra) {
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}${extra ? ` — ${extra}` : ''}`);
  if (!ok) process.exitCode = 1;
}

async function login(phone) {
  const otp = await call('POST', '/api/auth/send-otp', { phone_number: phone });
  const verified = await call('POST', '/api/auth/verify-otp', {
    phone_number: phone,
    code: otp.json.code,
  });
  return verified.json.token;
}

async function userRow(phone) {
  const { data } = await supabase.from('sp_users').select('*').eq('phone_number', phone).single();
  return data;
}

const run = async () => {
  // --- make sure the second demo trader is an admin -------------------------
  await supabase.from('sp_users').update({ role: 'admin' }).eq('phone_number', ADMIN);
  const adminRow = await userRow(ADMIN);
  check('admin role set', adminRow.role === 'admin');

  const traderToken = await login(TRADER);
  const adminToken = await login(ADMIN);

  // Release any orders left over from earlier runs so assertions start clean.
  const leftovers = (await call('GET', '/api/portfolio', undefined, traderToken)).json?.data?.open_orders ?? [];
  for (const o of leftovers) {
    await call('DELETE', `/api/orders/${o.id}`, undefined, traderToken);
  }
  check('cleanup of leftover open orders', true, `${leftovers.length} cancelled`);

  // --- cancel flow ---------------------------------------------------------
  const markets = (await call('GET', '/api/markets')).json.data;
  const target = markets.find(
    (m) => m.outcome_type === 'binary' && m.outcomes.some((o) => o.name === 'YES'),
  );

  const before = await userRow(TRADER);
  const rest = await call(
    'POST',
    '/api/orders',
    { market_id: target.id, outcome: 'YES', side: 'buy', price: 10, qty: 50 },
    traderToken,
  );
  check('resting order placed (no cross)', rest.status === 200 && rest.json.data.trades.length === 0);

  const mid = await userRow(TRADER);
  check(
    'escrow locked on resting order',
    mid.locked_balance - before.locked_balance === 500,
    `locked=${mid.locked_balance}`,
  );

  const cancelled = await call('DELETE', `/api/orders/${rest.json.data.order.id}`, undefined, traderToken);
  check('DELETE /api/orders/:id', cancelled.status === 200, `released=${cancelled.json?.data?.released}`);

  const afterCancel = await userRow(TRADER);
  check(
    'escrow released on cancel',
    afterCancel.locked_balance === before.locked_balance && afterCancel.balance === before.balance,
    `locked=${afterCancel.locked_balance}`,
  );

  // --- settlement flow -----------------------------------------------------
  const { data: position } = await supabase
    .from('sp_positions')
    .select('*, sp_markets!inner(question, status)')
    .eq('user_id', before.id)
    .eq('sp_markets.status', 'open')
    .gt('yes_shares', 0)
    .limit(1)
    .maybeSingle();

  if (!position) {
    console.log('[SKIP] settlement — no YES position to settle');
    return;
  }

  const marketId = position.market_id;
  const shares = position.yes_shares;
  const balanceBefore = (await userRow(TRADER)).balance;

  const settled = await call(
    'POST',
    `/api/admin/markets/${marketId}/settle`,
    { result: { winner: 'YES', source: 'smoke test' } },
    adminToken,
  );
  check('POST /api/admin/markets/:id/settle', settled.status === 200, JSON.stringify(settled.json).slice(0, 120));

  const balanceAfter = (await userRow(TRADER)).balance;
  check(
    'winning shares paid 100 each',
    balanceAfter - balanceBefore === shares * 100,
    `${shares} shares → +${balanceAfter - balanceBefore}`,
  );

  const { data: marketAfter } = await supabase
    .from('sp_markets')
    .select('status, settled_result')
    .eq('id', marketId)
    .single();
  check('market marked settled', marketAfter.status === 'settled');

  const { data: openOrders } = await supabase
    .from('sp_orders')
    .select('id')
    .eq('market_id', marketId)
    .in('status', ['open', 'partially_filled']);
  check('resting orders cancelled on settlement', (openOrders ?? []).length === 0);

  const { data: audit } = await supabase
    .from('sp_audit_logs')
    .select('id')
    .eq('market_id', marketId)
    .eq('action', 'settlement');
  check('settlement written to audit log', (audit ?? []).length === 1);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
