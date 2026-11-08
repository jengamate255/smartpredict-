// End-to-end smoke test against a running SmartPredict server.
// Usage: node scripts/smoke.mjs [baseUrl]
const BASE = process.argv[2] ?? 'http://localhost:3000';

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

function check(label, condition, extra) {
  const mark = condition ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${label}${extra ? ` — ${extra}` : ''}`);
  if (!condition) process.exitCode = 1;
}

const run = async () => {
  const health = await call('GET', '/api/markets');
  check('GET /api/markets', health.status === 200 && health.json?.success, `status=${health.status}`);

  const all = await call('GET', '/api/markets?status=');
  const markets = health.json?.data ?? [];
  check('markets seeded', (all.json?.data ?? []).length >= 12, `${all.json?.data?.length} markets total`);

  const binary = markets.find(
    (m) => m.outcome_type === 'binary' && (m.outcomes ?? []).some((o) => o.name === 'YES'),
  );
  check('binary market with YES book', Boolean(binary), binary?.question?.slice(0, 50));

  const yes = binary.outcomes.find((o) => o.name === 'YES');
  check(
    'market maker liquidity hydrated',
    yes.bids.length > 0 && yes.asks.length > 0,
    `bid=${yes.bids[0]?.price} ask=${yes.asks[0]?.price}`,
  );

  const phone = '255700000011';
  const otp = await call('POST', '/api/auth/send-otp', { phone_number: phone });
  check('POST /api/auth/send-otp', otp.status === 200 && otp.json?.code, `code=${otp.json?.code}`);

  const verified = await call('POST', '/api/auth/verify-otp', {
    phone_number: phone,
    code: otp.json.code,
  });
  check('POST /api/auth/verify-otp', verified.status === 200 && verified.json?.token);
  const token = verified.json?.token;

  const before = await call('GET', '/api/portfolio', undefined, token);
  check('GET /api/portfolio', before.status === 200 && before.json?.success);

  const order = await call(
    'POST',
    '/api/orders',
    { market_id: binary.id, outcome: 'YES', side: 'buy', price: 52, qty: 10 },
    token,
  );
  check(
    'POST /api/orders (crosses MM ask at 51)',
    order.status === 200 && (order.json?.data?.trades?.length ?? 0) > 0,
    `trades=${order.json?.data?.trades?.length} order=${order.json?.data?.order?.status}`,
  );

  const after = await call('GET', '/api/portfolio', undefined, token);
  const pos = (after.json?.data?.positions ?? []).find((p) => p.market_id === binary.id);
  check('position recorded', Boolean(pos), pos ? `yes_shares=${pos.yes_shares}` : 'none');

  console.log('\nPortfolio:', JSON.stringify(after.json?.data ?? {}, null, 2).slice(0, 1200));
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
