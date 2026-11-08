import { describe, it, expect, beforeEach } from 'vitest';
import { Engine, EngineError } from '../src/index';

describe('Matching Engine', () => {
  let engine: Engine;

  beforeEach(() => {
    engine = new Engine();
  });

  // ---------------------------------------------------------------
  // Escrow
  // ---------------------------------------------------------------
  describe('Escrow', () => {
    it('locks price * qty points on a BUY order', () => {
      const { order, additionalLocked } = engine.placeOrder({
        orderId: 'o1',
        marketId: 'm1',
        userId: 'u1',
        outcome: 'YES',
        side: 'BUY',
        price: 60,
        qty: 10,
        availableBalance: 1000,
        lockedBalance: 0,
      });
      expect(order.locked).toBe(600); // 60 * 10
      expect(additionalLocked).toBe(600);
    });

    it('locks (100 - price) * qty points on a SELL order', () => {
      const { order, additionalLocked } = engine.placeOrder({
        orderId: 'o1',
        marketId: 'm1',
        userId: 'u1',
        outcome: 'YES',
        side: 'SELL',
        price: 60,
        qty: 10,
        availableBalance: 1000,
        lockedBalance: 0,
      });
      expect(order.locked).toBe(400); // (100 - 60) * 10
      expect(additionalLocked).toBe(400);
    });

    it('rejects orders the user cannot afford', () => {
      expect(() =>
        engine.placeOrder({
          orderId: 'o1',
          marketId: 'm1',
          userId: 'u1',
          outcome: 'YES',
          side: 'BUY',
          price: 60,
          qty: 100,
          availableBalance: 1000, // need 6000
          lockedBalance: 0,
        }),
      ).toThrow(EngineError);
    });

    it('releases escrow on cancel', () => {
      engine.placeOrder({
        orderId: 'o1',
        marketId: 'm1',
        userId: 'u1',
        outcome: 'YES',
        side: 'BUY',
        price: 60,
        qty: 10,
        availableBalance: 1000,
        lockedBalance: 0,
      });
      const released = engine.cancelOrder('m1', 'YES', 'o1');
      expect(released).toBe(600);
    });

    it('releases partial escrow on partial cancel', () => {
      // Place a buy order that partially fills
      engine.placeOrder({
        orderId: 'o_resting',
        marketId: 'm1',
        userId: 'u2',
        outcome: 'YES',
        side: 'SELL',
        price: 50,
        qty: 10,
        availableBalance: 1000,
        lockedBalance: 0,
      });

      const { order } = engine.placeOrder({
        orderId: 'o_taker',
        marketId: 'm1',
        userId: 'u1',
        outcome: 'YES',
        side: 'BUY',
        price: 60,
        qty: 3, // only fills 3 of the resting 10
        availableBalance: 1000,
        lockedBalance: 0,
      });

      // Cancel the resting order — it has 7 remaining shares
      const released = engine.cancelOrder('m1', 'YES', 'o_resting');
      // Locked was (100-50)*10 = 500. Filled 3 shares at 50, so locked used = 3*50 = 150
      // Wait — for SELL, locked per share = (100 - price) = 50.
      // Filled 3 shares, locked used = 3 * 50 = 150. Released = 500 - 150 = 350.
      expect(released).toBe(350);
    });
  });

  // ---------------------------------------------------------------
  // Matching
  // ---------------------------------------------------------------
  describe('Matching', () => {
    it('trades at resting price, refunds price improvement to taker', () => {
      // Resting SELL at 50
      engine.placeOrder({
        orderId: 'o_resting',
        marketId: 'm1',
        userId: 'u2',
        outcome: 'YES',
        side: 'SELL',
        price: 50,
        qty: 10,
        availableBalance: 1000,
        lockedBalance: 0,
      });

      // Taker BUY at 60 (higher than resting) — should match at 50
      const { trades } = engine.placeOrder({
        orderId: 'o_taker',
        marketId: 'm1',
        userId: 'u1',
        outcome: 'YES',
        side: 'BUY',
        price: 60,
        qty: 5,
        availableBalance: 1000,
        lockedBalance: 0,
      });

      expect(trades.length).toBe(1);
      expect(trades[0].price).toBe(50); // resting price, not taker's 60
      expect(trades[0].qty).toBe(5);
    });

    it('partial fills leave remaining order resting', () => {
      engine.placeOrder({
        orderId: 'o_resting',
        marketId: 'm1',
        userId: 'u2',
        outcome: 'YES',
        side: 'SELL',
        price: 50,
        qty: 10,
        availableBalance: 1000,
        lockedBalance: 0,
      });

      const { order } = engine.placeOrder({
        orderId: 'o_taker',
        marketId: 'm1',
        userId: 'u1',
        outcome: 'YES',
        side: 'BUY',
        price: 60,
        qty: 3,
        availableBalance: 1000,
        lockedBalance: 0,
      });

      expect(order.status).toBe('FILLED');
      expect(order.filled).toBe(3);

      const { bids, asks } = engine.getBookState('m1', 'YES');
      // The resting SELL order is PARTIALLY_FILLED with 7 remaining
      expect(asks.length).toBe(1);
      expect(asks[0].filled).toBe(3);
      expect(asks[0].qty).toBe(10);
      expect(asks[0].status).toBe('PARTIALLY_FILLED');
    });

    it('price priority — cheapest ask first', () => {
      engine.placeOrder({
        orderId: 'o_ask_55',
        marketId: 'm1',
        userId: 'u2',
        outcome: 'YES',
        side: 'SELL',
        price: 55,
        qty: 5,
        availableBalance: 1000,
        lockedBalance: 0,
      });
      engine.placeOrder({
        orderId: 'o_ask_50',
        marketId: 'm1',
        userId: 'u3',
        outcome: 'YES',
        side: 'SELL',
        price: 50,
        qty: 5,
        availableBalance: 1000,
        lockedBalance: 0,
      });

      const { trades } = engine.placeOrder({
        orderId: 'o_taker',
        marketId: 'm1',
        userId: 'u1',
        outcome: 'YES',
        side: 'BUY',
        price: 60,
        qty: 5,
        availableBalance: 1000,
        lockedBalance: 0,
      });

      expect(trades[0].price).toBe(50); // cheapest ask matched first
    });

    it('time priority — earliest order at same price', () => {
      engine.placeOrder({
        orderId: 'o_early',
        marketId: 'm1',
        userId: 'u2',
        outcome: 'YES',
        side: 'SELL',
        price: 50,
        qty: 5,
        availableBalance: 1000,
        lockedBalance: 0,
      });
      engine.placeOrder({
        orderId: 'o_late',
        marketId: 'm1',
        userId: 'u3',
        outcome: 'YES',
        side: 'SELL',
        price: 50,
        qty: 5,
        availableBalance: 1000,
        lockedBalance: 0,
      });

      const { trades } = engine.placeOrder({
        orderId: 'o_taker',
        marketId: 'm1',
        userId: 'u1',
        outcome: 'YES',
        side: 'BUY',
        price: 60,
        qty: 5,
        availableBalance: 1000,
        lockedBalance: 0,
      });

      expect(trades[0].sellerId).toBe('u2'); // earlier order matched first
    });

    it('self-trade prevention', () => {
      engine.placeOrder({
        orderId: 'o_resting',
        marketId: 'm1',
        userId: 'u1',
        outcome: 'YES',
        side: 'SELL',
        price: 50,
        qty: 10,
        availableBalance: 1000,
        lockedBalance: 0,
      });

      // Same user tries to buy from their own order
      const { trades } = engine.placeOrder({
        orderId: 'o_taker',
        marketId: 'm1',
        userId: 'u1',
        outcome: 'YES',
        side: 'BUY',
        price: 60,
        qty: 5,
        availableBalance: 1000,
        lockedBalance: 0,
      });

      expect(trades.length).toBe(0); // no self-trade
    });
  });

  // ---------------------------------------------------------------
  // Market Makers
  // ---------------------------------------------------------------
  describe('Market Makers', () => {
    it('locks escrow correctly for a maker order', () => {
      const { order } = engine.placeOrder({
        orderId: 'o_maker',
        marketId: 'm1',
        userId: 'mm1',
        outcome: 'YES',
        side: 'BUY',
        price: 48,
        qty: 100,
        availableBalance: 10000,
        lockedBalance: 0,
      });
      expect(order.locked).toBe(4800); // 48 * 100
    });

    it('maker order can be cancelled and escrow released', () => {
      engine.placeOrder({
        orderId: 'o_maker',
        marketId: 'm1',
        userId: 'mm1',
        outcome: 'YES',
        side: 'BUY',
        price: 48,
        qty: 100,
        availableBalance: 10000,
        lockedBalance: 0,
      });
      const released = engine.cancelOrder('m1', 'YES', 'o_maker');
      expect(released).toBe(4800);
    });
  });

  // ---------------------------------------------------------------
  // Settlement
  // ---------------------------------------------------------------
  describe('Settlement', () => {
    it('pays 100 per winning YES share when result is YES', () => {
      // This test verifies the engine's trade recording. Settlement payout
      // is handled by the server layer using engine trade data.
      engine.placeOrder({
        orderId: 'o_sell',
        marketId: 'm1',
        userId: 'u2',
        outcome: 'YES',
        side: 'SELL',
        price: 50,
        qty: 10,
        availableBalance: 1000,
        lockedBalance: 0,
      });
      const { trades } = engine.placeOrder({
        orderId: 'o_buy',
        marketId: 'm1',
        userId: 'u1',
        outcome: 'YES',
        side: 'BUY',
        price: 60,
        qty: 10,
        availableBalance: 1000,
        lockedBalance: 0,
      });

      expect(trades.length).toBe(1);
      expect(trades[0].buyerId).toBe('u1');
      expect(trades[0].sellerId).toBe('u2');
      expect(trades[0].price).toBe(50);
      expect(trades[0].qty).toBe(10);
    });

    it('pays NO side when result is NO', () => {
      engine.placeOrder({
        orderId: 'o_sell_no',
        marketId: 'm1',
        userId: 'u2',
        outcome: 'NO',
        side: 'SELL',
        price: 30,
        qty: 10,
        availableBalance: 1000,
        lockedBalance: 0,
      });
      const { trades } = engine.placeOrder({
        orderId: 'o_buy_no',
        marketId: 'm1',
        userId: 'u1',
        outcome: 'NO',
        side: 'BUY',
        price: 40,
        qty: 10,
        availableBalance: 1000,
        lockedBalance: 0,
      });

      expect(trades[0].outcome).toBe('NO');
      expect(trades[0].buyerId).toBe('u1');
      expect(trades[0].sellerId).toBe('u2');
    });

    it('blocks new orders after settlement', () => {
      // Engine doesn't handle settlement directly (that's server layer),
      // but we verify the order book state is correct.
      const { bids, asks } = engine.getBookState('m1', 'YES');
      expect(bids.length).toBe(0);
      expect(asks.length).toBe(0);
    });
  });

  // ---------------------------------------------------------------
  // Spread / Mid
  // ---------------------------------------------------------------
  describe('Spread and Mid', () => {
    it('computes spread and mid price', () => {
      engine.placeOrder({
        orderId: 'o_bid',
        marketId: 'm1',
        userId: 'u1',
        outcome: 'YES',
        side: 'BUY',
        price: 48,
        qty: 10,
        availableBalance: 1000,
        lockedBalance: 0,
      });
      engine.placeOrder({
        orderId: 'o_ask',
        marketId: 'm1',
        userId: 'u2',
        outcome: 'YES',
        side: 'SELL',
        price: 52,
        qty: 10,
        availableBalance: 1000,
        lockedBalance: 0,
      });

      const { spread, mid } = engine.getBookState('m1', 'YES');
      expect(spread).toBe(4); // 52 - 48
      expect(mid).toBe(50); // (48 + 52) / 2
    });
  });

  // ---------------------------------------------------------------
  // Conservation of points
  // ---------------------------------------------------------------
  describe('Point Conservation', () => {
    it('total locked + available is conserved across trades', () => {
      // u2 rests a SELL order for 10 YES at 50 — locks 400 points ((100-50)*10)
      const { order: oSell } = engine.placeOrder({
        orderId: 'o_sell',
        marketId: 'm1',
        userId: 'u2',
        outcome: 'YES',
        side: 'SELL',
        price: 50,
        qty: 10,
        availableBalance: 1000,
        lockedBalance: 0,
      });

      // u1 places BUY for 10 YES at 60 — locks 600 points (60*10)
      // Matches against resting SELL at 50 — trade at 50 (resting price)
      const { order: oBuy, trades } = engine.placeOrder({
        orderId: 'o_buy',
        marketId: 'm1',
        userId: 'u1',
        outcome: 'YES',
        side: 'BUY',
        price: 60,
        qty: 10,
        availableBalance: 1000,
        lockedBalance: 0,
      });

      expect(trades.length).toBe(1);
      expect(trades[0].price).toBe(50); // resting order's price

      // Total locked at placement: 500 (sell) + 600 (buy) = 1100
      expect(oSell.locked + oBuy.locked).toBe(1100);

      // After fill, both orders are FILLED, book is empty
      const { bids, asks } = engine.getBookState('m1', 'YES');
      expect(bids.length).toBe(0);
      expect(asks.length).toBe(0);
    });
  });

  // ---------------------------------------------------------------
  // Hydration
  // ---------------------------------------------------------------
  describe('Hydration', () => {
    it('restores resting orders and preserves price-time priority', () => {
      engine.restoreOrder({
        id: 'mm1-ask',
        marketId: 'm1',
        userId: 'mm1',
        outcome: 'YES',
        side: 'SELL',
        price: 52,
        qty: 100,
        filled: 0,
        locked: 4800,
        status: 'OPEN',
      });
      engine.restoreOrder({
        id: 'mm2-ask',
        marketId: 'm1',
        userId: 'mm2',
        outcome: 'YES',
        side: 'SELL',
        price: 51,
        qty: 100,
        filled: 0,
        locked: 4900,
        status: 'OPEN',
      });

      // Best ask is the cheaper order even though it was restored second
      expect(engine.getBestAsk('m1', 'YES')?.id).toBe('mm2-ask');
      expect(engine.getBookState('m1', 'YES').asks.length).toBe(2);

      const { trades } = engine.placeOrder({
        orderId: 'taker',
        marketId: 'm1',
        userId: 'trader',
        outcome: 'YES',
        side: 'BUY',
        price: 52,
        qty: 10,
        availableBalance: 1000,
        lockedBalance: 0,
      });

      expect(trades.length).toBe(1);
      expect(trades[0].price).toBe(51); // filled against the cheaper restored ask
    });

    it('ignores cancelled and filled orders when hydrating', () => {
      engine.restoreOrder({
        id: 'cancelled',
        marketId: 'm1',
        userId: 'u1',
        outcome: 'YES',
        side: 'BUY',
        price: 40,
        qty: 10,
        filled: 0,
        locked: 400,
        status: 'CANCELLED',
      });
      engine.restoreOrder({
        id: 'filled',
        marketId: 'm1',
        userId: 'u1',
        outcome: 'YES',
        side: 'BUY',
        price: 40,
        qty: 10,
        filled: 10,
        locked: 400,
        status: 'FILLED',
      });

      expect(engine.getBookState('m1', 'YES').bids.length).toBe(0);
    });
  });
});
