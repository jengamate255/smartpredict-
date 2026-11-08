import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canTrade, filterMarkets, Market, orderEstimate, probability, quote } from '../src/market';

const market: Market = {
  id: 'm1', question: 'Je, Simba itashinda?', category: 'michezo', status: 'open', outcome_type: 'binary',
  close_at: '2099-01-01T00:00:00Z', resolution_source: 'TFF', resolution_source_url: 'https://tff.or.tz',
  outcomes: [
    { id: 'yes', name: 'YES', bids: [{ id: 'b', price: 49, qty: 10, filled: 0 }], asks: [{ id: 'a', price: 51, qty: 10, filled: 0 }] },
    { id: 'no', name: 'NO', asks: [{ id: 'n', price: 52, qty: 10, filled: 0 }] },
  ],
};
test('search and category filters combine and hide politics', () => {
  const markets = [market, { ...market, id: 'm2', category: 'uchumi', question: 'USD/TZS' }, { ...market, category: 'siasa' }];
  assert.equal(filterMarkets(markets, 'SIMBA', 'michezo').length, 1);
  assert.equal(filterMarkets(markets, 'Simba', 'uchumi').length, 0);
  assert.equal(filterMarkets(markets, '', 'all').length, 2);
});
test('uses each outcome actual ask rather than complementary prices', () => {
  assert.equal(quote(market, 'YES'), 51);
  assert.equal(quote(market, 'NO'), 52);
  assert.equal(probability(market), 50);
  assert.equal(quote({ ...market, outcomes: [] }, 'YES'), undefined);
});
test('whole shares leave unused points and use actual cost for profit', () => {
  assert.deepEqual(orderEstimate(100, 51), { qty: 1, cost: 51, remainder: 49, payout: 100, profit: 49 });
  assert.deepEqual(orderEstimate(1000, 42), { qty: 23, cost: 966, remainder: 34, payout: 2300, profit: 1334 });
});
test('invalid prices and budgets cannot create shares', () => {
  for (const price of [0, 100, 1.5, NaN]) assert.equal(orderEstimate(100, price).qty, 0);
  for (const budget of [0, -1, NaN, Infinity]) assert.equal(orderEstimate(budget, 51).qty, 0);
  assert.equal(orderEstimate(50, 51).qty, 0);
});
test('closed, expired, multi-outcome and politics markets cannot trade', () => {
  assert.equal(canTrade(market), true);
  assert.equal(canTrade({ ...market, status: 'settled' }), false);
  assert.equal(canTrade({ ...market, close_at: '2020-01-01T00:00:00Z' }), false);
  assert.equal(canTrade({ ...market, outcome_type: 'multi' }), false);
  assert.equal(canTrade({ ...market, category: 'siasa' }), false);
});
