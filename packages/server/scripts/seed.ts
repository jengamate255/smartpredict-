// scripts/seed.ts — Seed SmartPredict data into Smartsoko Supabase database
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const MARKETS = [
  {
    question: 'Je, USD/TZS itakwenda zaidi ya 2,750 katika mwisho wa juma hili?',
    category: 'uchumi',
    resolution_source: 'Bank of Tanzania',
    resolution_source_url: 'https://bot.go.tz',
    close_at: '2026-11-13T15:00:00+03:00',
    outcome_type: 'binary',
    outcomes: [
      { name: 'YES', order: 0 },
      { name: 'NO', order: 1 },
    ],
  },
  {
    question: 'Je, Benki Kuu ya Tanzania itatoa mapaato ya ribi kama vile mwisho wa mwezi huu?',
    category: 'uchumi',
    resolution_source: 'Bank of Tanzania',
    resolution_source_url: 'https://bot.go.tz',
    close_at: '2026-11-20T10:00:00+03:00',
    outcome_type: 'binary',
    outcomes: [
      { name: 'YES', order: 0 },
      { name: 'NO', order: 1 },
    ],
  },
  {
    question: 'Je, asimiliye ya kuwa na mvua asubuhi ya usiku wa jumanne, Dar es Salaam?',
    category: 'hewa',
    resolution_source: 'Tanzania Meteorological Authority',
    resolution_source_url: 'https://meteo.go.tz',
    close_at: '2026-11-10T06:00:00+03:00',
    outcome_type: 'binary',
    outcomes: [
      { name: 'YES', order: 0 },
      { name: 'NO', order: 1 },
    ],
  },
  {
    question: 'Je, Taifa Stars itashinda mchoro wake ujianaye ndani ya mwezi huu?',
    category: 'michezo',
    resolution_source: 'Tanzania Football Federation',
    resolution_source_url: 'https://tff.go.tz',
    close_at: '2026-11-15T16:00:00+03:00',
    outcome_type: 'binary',
    outcomes: [
      { name: 'YES', order: 0 },
      { name: 'NO', order: 1 },
    ],
  },
  {
    question: 'Je, Apple itatoa mpango wa iPhone jipya mwisho wa mwezi huu?',
    category: 'teknolojia',
    resolution_source: 'Apple Newsroom',
    resolution_source_url: 'https://apple.com/newsroom',
    close_at: '2026-11-30T23:59:00+03:00',
    outcome_type: 'binary',
    outcomes: [
      { name: 'YES', order: 0 },
      { name: 'NO', order: 1 },
    ],
  },
  {
    question: 'Je, USD/TZS itafunga 2,700-2,750 mwisho wa juma hili?',
    category: 'uchumi',
    outcome_type: 'multi',
    resolution_source: 'Bank of Tanzania',
    resolution_source_url: 'https://bot.go.tz',
    close_at: '2026-11-13T15:00:00+03:00',
    outcomes: [
      { name: '2600-2650', order: 0 },
      { name: '2650-2700', order: 1 },
      { name: '2700-2750', order: 2 },
      { name: '2750-2800', order: 3 },
      { name: '2800+', order: 4 },
    ],
  },
  {
    question: 'Je, Walimu wa serikali watapata addingi ya mapato mwezi huu?',
    category: 'uchumi',
    resolution_source: 'Tanzania Ministry of Education',
    resolution_source_url: 'https://mest.go.tz',
    close_at: '2026-11-25T12:00:00+03:00',
    outcome_type: 'binary',
    outcomes: [
      { name: 'YES', order: 0 },
      { name: 'NO', order: 1 },
    ],
  },
  {
    question: 'Je, Simba SC itakwenda na shinda Ligi Kuu Tanzania mwezi huu?',
    category: 'michezo',
    resolution_source: 'Tanzania Premier League',
    resolution_source_url: 'https://tanzaniapremierleague.go.tz',
    close_at: '2026-11-18T18:00:00+03:00',
    outcome_type: 'binary',
    outcomes: [
      { name: 'YES', order: 0 },
      { name: 'NO', order: 1 },
    ],
  },
  {
    question: 'Je, joto la juu la Dar es Salaam litakuwa zaidi ya 32°C jumanne next week?',
    category: 'hewa',
    resolution_source: 'Tanzania Meteorological Authority',
    resolution_source_url: 'https://meteo.go.tz',
    close_at: '2026-11-12T14:00:00+03:00',
    outcome_type: 'binary',
    outcomes: [
      { name: 'YES', order: 0 },
      { name: 'NO', order: 1 },
    ],
  },
  {
    question: 'Je, Starlink itatengenezwa halisi katika mikoa ya pwani mwisho wa mwaka huu?',
    category: 'teknolojia',
    resolution_source: 'Starlink / SpaceX',
    resolution_source_url: 'https://starlink.com',
    close_at: '2026-12-31T23:59:00+03:00',
    outcome_type: 'binary',
    outcomes: [
      { name: 'YES', order: 0 },
      { name: 'NO', order: 1 },
    ],
  },
  {
    question: 'Je, bazla ya nane itakuwa zaidi ya 5.2% mwisho wa mwezi huu?',
    category: 'uchumi',
    resolution_source: 'National Bureau of Statistics',
    resolution_source_url: 'https://nbs.go.tz',
    close_at: '2026-11-28T10:00:00+03:00',
    outcome_type: 'binary',
    outcomes: [
      { name: 'YES', order: 0 },
      { name: 'NO', order: 1 },
    ],
  },
  {
    question: 'Je, Yanga SC itashinda mchoro wa kuigizwa mwisho wa juma hili?',
    category: 'michezo',
    resolution_source: 'Tanzania Premier League',
    resolution_source_url: 'https://tanzaniapremierleague.go.tz',
    close_at: '2026-11-14T16:00:00+03:00',
    outcome_type: 'binary',
    outcomes: [
      { name: 'YES', order: 0 },
      { name: 'NO', order: 1 },
    ],
  },
];

async function main() {
  console.log('Seeding SmartPredict data into Smartsoko Supabase...');

  // Enable feature flag
  const { error: ffError } = await supabase
    .from('feature_flags')
    .upsert({ key: 'REAL_MONEY_ENABLED', enabled: false, updated_by: 'system' });
  if (ffError) console.error('Feature flag error:', ffError.message);

  // Create or find users
  const ensureUser = async (phone: string, name: string, balance: number, role: string) => {
    const { data: existing } = await supabase
      .from('sp_users')
      .select('*')
      .eq('phone_number', phone)
      .single();
    if (existing) return existing;

    const { data: user, error } = await supabase
      .from('sp_users')
      .insert({ phone_number: phone, name, balance, role })
      .select()
      .single();
    if (error) throw error;
    return user;
  };

  const mm1 = await ensureUser('255700000001', 'House MM 1', 1_000_000, 'market_maker');
  const mm2 = await ensureUser('255700000002', 'House MM 2', 1_000_000, 'market_maker');
  const trader1 = await ensureUser('255700000011', 'Mwanafunzi A', 2500, 'user');
  const trader2 = await ensureUser('255700000012', 'Mwanafunzi B', 1800, 'user');

  console.log('Users:', { mm1: mm1.id, mm2: mm2.id, trader1: trader1.id, trader2: trader2.id });

  // Escrow is accumulated across every seeded order and written once at the end.
  const lockedByUser = new Map<string, number>();
  const addLock = (userId: string, amount: number) => {
    lockedByUser.set(userId, (lockedByUser.get(userId) ?? 0) + amount);
  };

  const seedOrder = async (
    userId: string,
    marketId: string,
    outcomeId: string,
    side: 'buy' | 'sell',
    price: number,
    qty = 100,
  ) => {
    const locked = side === 'buy' ? price * qty : (100 - price) * qty;
    const { data, error } = await supabase
      .from('sp_orders')
      .insert({
        id: randomUUID(),
        market_id: marketId,
        user_id: userId,
        outcome_id: outcomeId,
        side,
        price,
        qty,
        filled_qty: 0,
        locked,
        status: 'open',
      })
      .select()
      .single();

    if (error) {
      console.error('Order error:', error.message);
      return;
    }

    addLock(userId, locked);
    await supabase.from('sp_balance_changes').insert({
      user_id: userId,
      amount: -locked,
      reason: 'trade_escrow_lock',
      reference: data.id,
    });
  };

  const { data: existingMarkets } = await supabase.from('sp_markets').select('question');
  const existingQuestions = new Set((existingMarkets ?? []).map((m: any) => m.question));

  for (const m of MARKETS) {
    if (existingQuestions.has(m.question)) {
      console.log(`Skipping existing market: ${m.question.substring(0, 40)}...`);
      continue;
    }

    const { data: market, error: merr } = await supabase
      .from('sp_markets')
      .insert({
        question: m.question,
        category: m.category,
        outcome_type: m.outcome_type,
        resolution_source: m.resolution_source,
        resolution_source_url: m.resolution_source_url,
        close_at: m.close_at,
        created_by: mm1.id,
      })
      .select()
      .single();

    if (merr) {
      console.error(`Failed to create market ${m.question.substring(0, 40)}:`, merr.message);
      continue;
    }

    console.log(`Created market: ${market.id} — ${m.question.substring(0, 40)}...`);

    // Create outcomes
    const outcomeRows = m.outcomes.map((o: any, i: number) => ({
      market_id: market.id,
      name: o.name,
      order_index: o.order ?? i,
    }));
    const { error: oerr } = await supabase.from('sp_market_outcomes').insert(outcomeRows);
    if (oerr) console.error('Outcome error:', oerr.message);

    // Seed market maker liquidity (4-point spread around mid 50)
    for (const outcome of m.outcomes) {
      const outcomeRes = await supabase
        .from('sp_market_outcomes')
        .select('id')
        .eq('market_id', market.id)
        .eq('name', outcome.name)
        .single();
      if (outcomeRes.error) continue;
      const outcomeId = outcomeRes.data.id;

      // MM1: bid 48, ask 52
      await seedOrder(mm1.id, market.id, outcomeId, 'buy', 48);
      await seedOrder(mm1.id, market.id, outcomeId, 'sell', 52);

      // MM2: bid 49, ask 51
      await seedOrder(mm2.id, market.id, outcomeId, 'buy', 49);
      await seedOrder(mm2.id, market.id, outcomeId, 'sell', 51);
    }
  }

  for (const [userId, amount] of lockedByUser) {
    const { error } = await supabase
      .from('sp_users')
      .update({ locked_balance: amount })
      .eq('id', userId);
    if (error) console.error('Locked balance update error:', error.message);
  }

  console.log('\nSeed complete!');
  console.log(`Markets: ${MARKETS.length}`);
  console.log('Market makers: mm1, mm2');
  console.log('Demo traders: trader1, trader2');
  console.log(`Escrowed per market maker: ${JSON.stringify(Object.fromEntries(lockedByUser))}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
