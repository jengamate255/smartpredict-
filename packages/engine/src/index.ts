// @smartpredict/engine — Matching engine for SmartPredict
// Single source of truth for all order matching, server-side only.
// Plain TypeScript module — no framework dependencies.

export type Side = 'BUY' | 'SELL';
export type Outcome = 'YES' | 'NO';
export type OrderStatus = 'OPEN' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED';

export interface Order {
  id: string;
  marketId: string;
  userId: string;
  outcome: Outcome;
  side: Side;
  price: number;      // 1..99
  qty: number;        // whole shares
  filled: number;     // shares filled so far
  locked: number;     // points escrowed
  status: OrderStatus;
  seq: number;        // arrival sequence for time priority
}

export interface Trade {
  id: string;
  marketId: string;
  buyerId: string;
  sellerId: string;
  outcome: Outcome;
  price: number;      // execution price (resting order's price)
  qty: number;
  at: string;         // ISO timestamp
  buyOrderId?: string;  // order that bought
  sellOrderId?: string; // order that sold
}

export interface Position {
  userId: string;
  marketId: string;
  outcome: Outcome;
  yes: number;        // net YES shares
  no: number;         // net NO shares
}

export interface EngineError extends Error {
  code: string;
}

export class EngineError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
    this.name = 'EngineError';
  }
}

// ---------------------------------------------------------------------------
// OrderBook — in-memory book for a single market outcome
// ---------------------------------------------------------------------------

class OrderBook {
  // bids: buy orders, sorted by price DESC (highest bid first)
  // asks: sell orders, sorted by price ASC (lowest ask first)
  private _bids: Order[] = [];
  private _asks: Order[] = [];
  private seq = 0;

  add(order: Order): void {
    order.seq = this.seq++;
    if (order.side === 'BUY') {
      this._bids.push(order);
      this._bids.sort((a, b) => {
        if (b.price !== a.price) return b.price - a.price;
        return a.seq - b.seq;
      });
    } else {
      this._asks.push(order);
      this._asks.sort((a, b) => {
        if (a.price !== b.price) return a.price - b.price;
        return a.seq - b.seq;
      });
    }
  }

  get bestBid(): Order | undefined {
    return this._bids[0];
  }

  get bestAsk(): Order | undefined {
    return this._asks[0];
  }

  get bids(): Order[] {
    return [...this._bids];
  }

  get asks(): Order[] {
    return [...this._asks];
  }

  remove(orderId: string): void {
    this._bids = this._bids.filter((o) => o.id !== orderId);
    this._asks = this._asks.filter((o) => o.id !== orderId);
  }

  getAll(): Order[] {
    return [...this._bids, ...this._asks];
  }
}

// ---------------------------------------------------------------------------
// Engine — matching engine, single source of truth
// ---------------------------------------------------------------------------

export class Engine {
  // marketId -> outcome -> OrderBook
  private books = new Map<string, Map<Outcome, OrderBook>>();
  private trades: Trade[] = [];
  private tradeCounter = 0;

  private getBook(marketId: string, outcome: Outcome): OrderBook {
    let byOutcome = this.books.get(marketId);
    if (!byOutcome) {
      byOutcome = new Map();
      this.books.set(marketId, byOutcome);
    }
    let book = byOutcome.get(outcome);
    if (!book) {
      book = new OrderBook();
      byOutcome.set(outcome, book);
    }
    return book;
  }

  // -----------------------------------------------------------------------
  // placeOrder — attempt to place and match an order
  // Returns { trades, order, remainingLocked }
  // -----------------------------------------------------------------------
  placeOrder(params: {
    orderId: string;
    marketId: string;
    userId: string;
    outcome: Outcome;
    side: Side;
    price: number;
    qty: number;
    availableBalance: number; // user's unlocked balance
    lockedBalance: number;    // user's currently locked balance
  }): {
    trades: Trade[];
    order: Order;
    additionalLocked: number;
  } {
    const {
      orderId,
      marketId,
      userId,
      outcome,
      side,
      price,
      qty,
      availableBalance,
      lockedBalance,
    } = params;

    // ---- Validation ----
    if (!Number.isInteger(price) || price < 1 || price > 99) {
      throw new EngineError('Price must be an integer between 1 and 99', 'INVALID_PRICE');
    }
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new EngineError('Quantity must be a positive integer', 'INVALID_QTY');
    }
    if (!Number.isInteger(availableBalance) || availableBalance < 0) {
      throw new EngineError('Invalid available balance', 'INVALID_BALANCE');
    }

    const book = this.getBook(marketId, outcome);
    const trades: Trade[] = [];
    let remainingQty = qty;

    // ---- Compute worst-case locked amount ----
    // BUY: worst case = price * qty (all shares fill at this price)
    // SELL: worst case = (100 - price) * qty (all shares fill at this price)
    const worstCaseLocked =
      side === 'BUY' ? price * qty : (100 - price) * qty;

    // Check user can afford the worst-case lock
    if (availableBalance < worstCaseLocked) {
      throw new EngineError(
        `Insufficient balance: need ${worstCaseLocked}, have ${availableBalance}`,
        'INSUFFICIENT_BALANCE',
      );
    }

    const now = new Date().toISOString();

    // ---- Matching loop ----
    while (remainingQty > 0) {
      const contra =
        side === 'BUY' ? book.bestAsk : book.bestBid;

      if (!contra) break; // no contra liquidity

      // ---- Self-trade prevention ----
      if (contra.userId === userId) {
        // Cannot trade with ourselves. If this is the only contra order, stop.
        // Move past this contra order — but since it's the best, we can't match.
        break;
      }

      // ---- Price check ----
      // BUY matches if our price >= ask price
      // SELL matches if our price <= bid price
      const canMatch =
        side === 'BUY' ? price >= contra.price : price <= contra.price;
      if (!canMatch) break;

      // ---- Execution at resting order's price ----
      const execPrice = contra.price;
      const matchQty = Math.min(remainingQty, contra.qty - contra.filled);

      trades.push({
        id: `t_${++this.tradeCounter}`,
        marketId,
        buyerId: side === 'BUY' ? userId : contra.userId,
        sellerId: side === 'BUY' ? contra.userId : userId,
        outcome,
        price: execPrice,
        qty: matchQty,
        at: now,
        buyOrderId: side === 'BUY' ? orderId : contra.id,
        sellOrderId: side === 'SELL' ? orderId : contra.id,
      });

      // Update contra order fill
      contra.filled += matchQty;
      remainingQty -= matchQty;

      if (contra.filled >= contra.qty) {
        contra.status = 'FILLED';
        book.remove(contra.id);
      } else {
        contra.status = 'PARTIALLY_FILLED';
      }
    }

    // ---- Create the resting order (if any qty remains) ----
    const filledQty = qty - remainingQty;
    const status =
      remainingQty === 0
        ? 'FILLED'
        : filledQty > 0
          ? 'PARTIALLY_FILLED'
          : 'OPEN';

    const order: Order = {
      id: orderId,
      marketId,
      userId,
      outcome,
      side,
      price,
      qty,
      filled: filledQty,
      locked: worstCaseLocked, // full worst-case locked upfront
      status,
      seq: 0, // will be set by book.add()
    };

    // ---- Compute additional locked beyond what user already has locked ----
    // The engine doesn't track user-level locks; the caller (server) does.
    // We return the worst-case locked amount so the server can deduct from balance.
    const additionalLocked = worstCaseLocked;

    // ---- Add remaining qty to book ----
    if (remainingQty > 0) {
      book.add(order);
    } else {
      // Order fully filled — still add with seq for audit but mark FILLED
      // (not in book since it's complete)
      order.seq = this.nextSeq();
    }

    return { trades, order, additionalLocked };
  }

  private nextSeq(): number {
    this.tradeCounter++;
    return this.tradeCounter;
  }

  // -----------------------------------------------------------------------
  // cancelOrder — cancel an open order, release escrow
  // Returns the released locked amount
  // -----------------------------------------------------------------------
  cancelOrder(marketId: string, outcome: Outcome, orderId: string): number {
    const book = this.getBook(marketId, outcome);
    // Find the order in the book
    const all = book.getAll();
    const order = all.find((o) => o.id === orderId);

    if (!order) {
      throw new EngineError('Order not found in book', 'ORDER_NOT_FOUND');
    }
    if (order.status !== 'OPEN' && order.status !== 'PARTIALLY_FILLED') {
      throw new EngineError('Order cannot be cancelled', 'ORDER_NOT_CANCELLABLE');
    }

    // Release locked = worstCaseLocked - (locked used for fills)
    // For a partially filled order, filled shares already consumed locked points.
    // Remaining locked to release = locked - (locked per filled share)
    const lockedPerFilledShare =
      order.side === 'BUY' ? order.price : 100 - order.price;
    const lockedUsed = lockedPerFilledShare * order.filled;
    const released = order.locked - lockedUsed;

    book.remove(orderId);
    order.status = 'CANCELLED';

    return released;
  }

  // -----------------------------------------------------------------------
  // restoreOrder — rehydrate a resting order from durable storage
  // Used at server boot so DB-backed orders participate in matching.
  // Filled/cancelled orders are ignored (they are not resting liquidity).
  // -----------------------------------------------------------------------
  restoreOrder(order: Omit<Order, 'seq'>): void {
    if (order.status === 'FILLED' || order.status === 'CANCELLED') return;
    if (!order.qty || order.filled >= order.qty) return;
    const book = this.getBook(order.marketId, order.outcome);
    book.add({ ...order, seq: 0 });
  }

  // -----------------------------------------------------------------------
  // getBookState — return current bids and asks for a market outcome
  // -----------------------------------------------------------------------
  getBookState(marketId: string, outcome: Outcome): {
    bids: Order[];
    asks: Order[];
    spread?: number;
    mid?: number;
  } {
    const book = this.getBook(marketId, outcome);
    const bids = [...book.bids];
    const asks = [...book.asks];

    let spread: number | undefined;
    let mid: number | undefined;
    if (bids[0] && asks[0]) {
      spread = asks[0].price - bids[0].price;
      mid = (bids[0].price + asks[0].price) / 2;
    }

    return { bids, asks, spread, mid };
  }

  // -----------------------------------------------------------------------
  // getTrades — return trades for a market
  // -----------------------------------------------------------------------
  getTrades(marketId: string): Trade[] {
    return this.trades.filter((t) => t.marketId === marketId);
  }

  // -----------------------------------------------------------------------
  // getBestBid / getBestAsk
  // -----------------------------------------------------------------------
  getBestBid(marketId: string, outcome: Outcome): Order | undefined {
    return this.getBook(marketId, outcome).bestBid;
  }

  getBestAsk(marketId: string, outcome: Outcome): Order | undefined {
    return this.getBook(marketId, outcome).bestAsk;
  }
}
