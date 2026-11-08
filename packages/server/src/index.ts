import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Engine } from '@smartpredict/engine';
import { z } from 'zod';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      phone_number: string;
      balance: number;
      locked_balance: number;
      role: string;
    };
  }
}

const PORT = Number(process.env.PORT) || 3000;
const REAL_MONEY_ENABLED = process.env.REAL_MONEY_ENABLED === 'true';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

const otpStore = new Map<string, { code: string; expiresAt: number }>();
const wsClients = new Map<string, { socket: any }>();

function generateOTP(): string {
  const digits = '0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += digits[Math.floor(Math.random() * digits.length)];
  }
  return code;
}

function broadcast(channel: string, data: any) {
  const message = JSON.stringify({ channel, data, ts: new Date().toISOString() });
  for (const [, client] of wsClients) {
    try {
      client.socket.send(message);
    } catch {
      // ignore
    }
  }
}

async function authRequired(req: any, reply: any) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return reply.code(401).send({ success: false, error: 'Authentication required' });
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: session, error } = await supabase
    .from('sp_sessions')
    .select('*, user:sp_users(*)')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (error || !session) {
    return reply.code(401).send({ success: false, error: 'Invalid or expired session' });
  }
  req.user = session.user;
}

async function adminRequired(req: any, reply: any) {
  if (!req.user || req.user.role !== 'admin') {
    return reply.code(403).send({ success: false, error: 'Admin only' });
  }
}

async function main() {
  const app = fastify({ logger: true });
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const engine = new Engine();

  // -------------------------------------------------------------------------
  // Balance helpers — always read-then-write so concurrent fills stay correct
  // -------------------------------------------------------------------------
  async function adjustUser(
    userId: string,
    delta: { balance?: number; locked?: number },
  ): Promise<void> {
    const { data: u, error } = await supabase
      .from('sp_users')
      .select('balance, locked_balance')
      .eq('id', userId)
      .single();
    if (error || !u) return;
    const balance = u.balance + (delta.balance ?? 0);
    const locked = Math.max(0, u.locked_balance + (delta.locked ?? 0));
    await supabase
      .from('sp_users')
      .update({ balance, locked_balance: locked })
      .eq('id', userId);
  }

  async function recordBalanceChange(
    userId: string,
    amount: number,
    reason: string,
    reference: string,
  ): Promise<void> {
    await supabase.from('sp_balance_changes').insert({
      user_id: userId,
      amount,
      reason,
      reference,
    });
  }

  // -------------------------------------------------------------------------
  // Engine hydration — DB is durable truth, engine is matching truth
  // -------------------------------------------------------------------------
  async function hydrateEngine(): Promise<number> {
    const { data, error } = await supabase
      .from('sp_orders')
      .select(
        'id, market_id, user_id, side, price, qty, filled_qty, locked, status, created_at, sp_market_outcomes(name)',
      )
      .in('status', ['open', 'partially_filled'])
      .order('created_at', { ascending: true });

    if (error) {
      app.log.error({ err: error }, 'Engine hydration failed');
      return 0;
    }

    let restored = 0;
    for (const row of (data ?? []) as any[]) {
      const name = row.sp_market_outcomes?.name;
      if (name !== 'YES' && name !== 'NO') continue;
      if (!row.qty || (row.filled_qty ?? 0) >= row.qty) continue;

      engine.restoreOrder({
        id: row.id,
        marketId: row.market_id,
        userId: row.user_id,
        outcome: name,
        side: row.side.toUpperCase() as 'BUY' | 'SELL',
        price: row.price,
        qty: row.qty,
        filled: row.filled_qty ?? 0,
        locked: row.locked,
        status: row.status === 'partially_filled' ? 'PARTIALLY_FILLED' : 'OPEN',
      });
      restored++;
    }

    app.log.info(`Hydrated ${restored} resting orders into the matching engine`);
    return restored;
  }

  await app.register(cors, { origin: true });
  await app.register(fastifyWebsocket);

  // =========================================================================
  // Routes: Auth
  // =========================================================================

  const sendOTPSchema = z.object({ phone_number: z.string().min(10).max(15) });

  app.post('/api/auth/send-otp', async (req, reply) => {
    const { phone_number } = sendOTPSchema.parse(req.body);
    const code = generateOTP();
    otpStore.set(phone_number, { code, expiresAt: Date.now() + 10 * 60 * 1000 });
    app.log.info(`OTP for ${phone_number}: ${code}`);
    return { success: true, message: 'OTP sent', code };
  });

  const verifyOTPSchema = z.object({
    phone_number: z.string(),
    code: z.string().length(6),
  });

  app.post('/api/auth/verify-otp', async (req, reply) => {
    const { phone_number, code } = verifyOTPSchema.parse(req.body);
    const record = otpStore.get(phone_number);
    if (!record || record.code !== code || record.expiresAt < Date.now()) {
      return reply.code(401).send({ success: false, error: 'Invalid or expired OTP' });
    }

    let { data: user, error } = await supabase
      .from('sp_users')
      .select('*')
      .eq('phone_number', phone_number)
      .single();

    if (error || !user) {
      const { data: newUser, error: createError } = await supabase
        .from('sp_users')
        .insert({ phone_number, balance: 1000, role: 'user' })
        .select()
        .single();
      if (createError) {
        return reply.code(500).send({ success: false, error: createError.message });
      }
      user = newUser;
    }

    const token = `${user.id}_${Date.now()}`;
    const { error: sessionError } = await supabase.from('sp_sessions').insert({
      user_id: user.id,
      token,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    if (sessionError) {
      return reply.code(500).send({ success: false, error: sessionError.message });
    }

    otpStore.delete(phone_number);
    return {
      success: true,
      token,
      user: { id: user.id, phone_number: user.phone_number, balance: user.balance },
    };
  });

  // =========================================================================
  // Routes: Markets
  // =========================================================================

  app.get('/api/markets', async (req, reply) => {
    const { category, status = 'open', outcome_type } = req.query as any;
    let query = supabase
      .from('sp_markets')
      .select('*, outcomes:sp_market_outcomes(*)')
      .order('close_at', { ascending: true });

    if (category) query = query.eq('category', category);
    if (status) query = query.eq('status', status);
    if (outcome_type) query = query.eq('outcome_type', outcome_type);

    if (!REAL_MONEY_ENABLED) {
      query = query.neq('category', 'siasa');
    }

    const { data: markets, error } = await query;
    if (error) return reply.code(500).send({ success: false, error: error.message });

    const marketsWithBook = await Promise.all(
      (markets || []).map(async (m: any) => {
        const outcomesWithBook = await Promise.all(
          m.outcomes.map(async (o: any) => {
            const book = engine.getBookState(m.id, o.name as 'YES' | 'NO');
            return { ...o, ...book };
          }),
        );
        return { ...m, outcomes: outcomesWithBook };
      }),
    );

    return { success: true, data: marketsWithBook };
  });

  app.get('/api/markets/:id', async (req, reply) => {
    const { data: market, error } = await supabase
      .from('sp_markets')
      .select('*, outcomes:sp_market_outcomes(*), trades:sp_trades(*)')
      .eq('id', (req.params as any).id)
      .single();

    if (error || !market) return reply.code(404).send({ success: false, error: 'Market not found' });

    const outcomesWithBook = await Promise.all(
      market.outcomes.map(async (o: any) => {
        const book = engine.getBookState(market.id, o.name as 'YES' | 'NO');
        return { ...o, ...book };
      }),
    );

    return { success: true, data: { ...market, outcomes: outcomesWithBook } };
  });

  const createMarketSchema = z.object({
    question: z.string().min(5),
    category: z.enum(['uchumi', 'michezo', 'hewa', 'teknolojia', 'siasa']),
    outcome_type: z.enum(['binary', 'multi']).default('binary'),
    resolution_source: z.string(),
    resolution_source_url: z.string().url(),
    close_at: z.string().datetime(),
    outcomes: z.array(z.object({ name: z.string(), order: z.number().default(0) })).optional(),
  });

  app.post(
    '/api/markets',
    { preHandler: [authRequired, adminRequired] },
    async (req, reply) => {
      const data = createMarketSchema.parse(req.body);

      if (data.category === 'siasa' && !REAL_MONEY_ENABLED) {
        return reply.code(403).send({ success: false, error: 'Politics market disabled' });
      }

      const { data: market, error } = await supabase
        .from('sp_markets')
        .insert({
          question: data.question,
          category: data.category,
          outcome_type: data.outcome_type,
          resolution_source: data.resolution_source,
          resolution_source_url: data.resolution_source_url,
          close_at: data.close_at,
          created_by: req.user!.id,
        })
        .select()
        .single();

      if (error) return reply.code(500).send({ success: false, error: error.message });

      const outcomeRows = (data.outcomes || [{ name: 'YES', order: 0 }, { name: 'NO', order: 1 }]).map(
        (o: any, i: number) => ({ market_id: market.id, name: o.name, order_index: o.order ?? i }),
      );
      const { error: oe } = await supabase.from('sp_market_outcomes').insert(outcomeRows);
      if (oe) return reply.code(500).send({ success: false, error: oe.message });

      await supabase.from('sp_audit_logs').insert({
        user_id: req.user!.id,
        market_id: market.id,
        action: 'create_market',
        entity: 'market',
        entity_id: market.id,
      });

      broadcast('markets', { action: 'created', market });
      return { success: true, data: market };
    },
  );

  // =========================================================================
  // Routes: Orders
  // =========================================================================

  const placeOrderSchema = z.object({
    market_id: z.string(),
    outcome: z.enum(['YES', 'NO']),
    side: z.enum(['buy', 'sell']),
    price: z.number().int().min(1).max(99),
    qty: z.number().int().positive(),
  });

  app.post(
    '/api/orders',
    { preHandler: [authRequired] },
    async (req, reply) => {
      const { market_id, outcome, side, price, qty } = placeOrderSchema.parse(req.body);
      const user = req.user!;

      const { data: market, error: merr } = await supabase
        .from('sp_markets')
        .select('*')
        .eq('id', market_id)
        .single();
      if (merr || !market) return reply.code(404).send({ success: false, error: 'Market not found' });
      if (market.status !== 'open') {
        return reply.code(400).send({ success: false, error: 'Market is not open' });
      }

      const availableBalance = user.balance - user.locked_balance;

      let result: any;
      try {
        result = engine.placeOrder({
          orderId: randomUUID(),
          marketId: market_id,
          userId: user.id,
          outcome,
          side: side.toUpperCase() as 'BUY' | 'SELL',
          price,
          qty,
          availableBalance,
          lockedBalance: user.locked_balance,
        });
      } catch (e: any) {
        return reply.code(400).send({ success: false, error: e.message });
      }

      const { trades, order, additionalLocked } = result;

      const outcomeRes = await supabase
        .from('sp_market_outcomes')
        .select('id')
        .eq('market_id', market_id)
        .eq('name', outcome)
        .single();
      if (outcomeRes.error) {
        return reply.code(500).send({ success: false, error: 'Outcome not found' });
      }
      const outcomeId = outcomeRes.data.id;

      const { data: dbOrder, error: oerr } = await supabase
        .from('sp_orders')
        .insert({
          id: order.id,
          market_id,
          user_id: user.id,
          outcome_id: outcomeId,
          side,
          price,
          qty,
          filled_qty: order.filled,
          locked: order.locked,
          status: order.status.toLowerCase(),
        })
        .select()
        .single();
      if (oerr) return reply.code(500).send({ success: false, error: oerr.message });

      // Lock the worst-case escrow for this order (refunds settle on fill/cancel).
      await adjustUser(user.id, { locked: additionalLocked });

      const createdTrades = [];
      for (const t of trades) {
        const tOutcomeRes = await supabase
          .from('sp_market_outcomes')
          .select('id')
          .eq('market_id', market_id)
          .eq('name', t.outcome)
          .single();
        if (tOutcomeRes.error) continue;

        const opposite: 'YES' | 'NO' = t.outcome === 'YES' ? 'NO' : 'YES';
        const oppositeRes = await supabase
          .from('sp_market_outcomes')
          .select('id')
          .eq('market_id', market_id)
          .eq('name', opposite)
          .single();
        if (oppositeRes.error) continue;

        const { data: dbTrade, error: terr } = await supabase
          .from('sp_trades')
          .insert({
            id: randomUUID(),
            market_id,
            order_id: dbOrder.id,
            buyer_id: t.buyerId,
            seller_id: t.sellerId,
            outcome_id: tOutcomeRes.data.id,
            price: t.price,
            qty: t.qty,
          })
          .select()
          .single();
        if (terr) continue;
        createdTrades.push(dbTrade);

        // The buyer holds the traded outcome; the seller holds the opposite one.
        await addShares(t.buyerId, market_id, tOutcomeRes.data.id, t.outcome, t.qty, t.price);
        await addShares(t.sellerId, market_id, oppositeRes.data.id, opposite, t.qty, 100 - t.price);

        // Escrow release uses each side's own limit price (price improvement refunded).
        const buyerLimit = side === 'buy' ? price : t.price;
        const sellerLimit = side === 'sell' ? price : t.price;
        const buyerPaid = t.price * t.qty;
        const sellerPaid = (100 - t.price) * t.qty;

        await adjustUser(t.buyerId, { balance: -buyerPaid, locked: -buyerLimit * t.qty });
        await adjustUser(t.sellerId, { balance: -sellerPaid, locked: -(100 - sellerLimit) * t.qty });

        await recordBalanceChange(t.buyerId, -buyerPaid, 'trade_settle_debit', dbTrade.id);
        await recordBalanceChange(t.sellerId, -sellerPaid, 'trade_settle_debit', dbTrade.id);

        // Keep the resting counterparty's row in sync (filled qty + status).
        const contraId = side === 'buy' ? t.sellOrderId : t.buyOrderId;
        if (contraId && contraId !== dbOrder.id) {
          const { data: contra } = await supabase
            .from('sp_orders')
            .select('qty, filled_qty')
            .eq('id', contraId)
            .maybeSingle();
          if (contra) {
            const newFilled = (contra.filled_qty ?? 0) + t.qty;
            await supabase
              .from('sp_orders')
              .update({
                filled_qty: newFilled,
                status: newFilled >= contra.qty ? 'filled' : 'partially_filled',
                updated_at: new Date().toISOString(),
              })
              .eq('id', contraId);
          }
        }
      }

      broadcast('orders', { action: 'placed', order: dbOrder });
      broadcast('trades', { action: 'created', trades: createdTrades });

      return { success: true, data: { order: dbOrder, trades: createdTrades } };
    },
  );

  async function addShares(
    userId: string,
    marketId: string,
    outcomeId: string,
    outcome: 'YES' | 'NO',
    qty: number,
    price: number,
  ) {
    const { data: existing } = await supabase
      .from('sp_positions')
      .select('*')
      .eq('user_id', userId)
      .eq('market_id', marketId)
      .eq('outcome_id', outcomeId)
      .maybeSingle();

    const yesDelta = outcome === 'YES' ? qty : 0;
    const noDelta = outcome === 'NO' ? qty : 0;

    if (existing) {
      const newQty = existing.qty + qty;
      const newAvg =
        newQty > 0
          ? Math.round(((existing.avg_price ?? 0) * existing.qty + price * qty) / newQty)
          : 0;
      const { error } = await supabase
        .from('sp_positions')
        .update({
          qty: newQty,
          avg_price: newAvg,
          yes_shares: existing.yes_shares + yesDelta,
          no_shares: existing.no_shares + noDelta,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      if (error) console.error('Position update error:', error.message);
    } else {
      const { error } = await supabase.from('sp_positions').insert({
        user_id: userId,
        market_id: marketId,
        outcome_id: outcomeId,
        qty,
        avg_price: price,
        yes_shares: yesDelta,
        no_shares: noDelta,
      });
      if (error) console.error('Position insert error:', error.message);
    }
  }

  app.delete(
    '/api/orders/:id',
    { preHandler: [authRequired] },
    async (req, reply) => {
      const user = req.user!;
      const { data: order, error } = await supabase
        .from('sp_orders')
        .select('*, sp_market_outcomes(name, market_id)')
        .eq('id', (req.params as any).id)
        .single();
      if (error || !order) return reply.code(404).send({ success: false, error: 'Order not found' });
      if (order.user_id !== user.id) return reply.code(403).send({ success: false, error: 'Not your order' });
      if (order.status !== 'open' && order.status !== 'partially_filled') {
        return reply.code(400).send({ success: false, error: 'Order not cancellable' });
      }

      const oc = order.sp_market_outcomes as any;
      let released = 0;
      try {
        released = engine.cancelOrder(oc.market_id, oc.name as 'YES' | 'NO', order.id);
      } catch {
        // Not in the in-memory book (e.g. already filled elsewhere): release
        // whatever escrow is left after accounting for filled shares.
        const perShare = order.side === 'buy' ? order.price : 100 - order.price;
        released = Math.max(0, (order.locked ?? 0) - perShare * (order.filled_qty ?? 0));
      }

      await supabase.from('sp_orders').update({ status: 'cancelled' }).eq('id', order.id);
      await adjustUser(user.id, { locked: -released });
      await recordBalanceChange(user.id, released, 'order_cancel_refund', order.id);
      await supabase.from('sp_audit_logs').insert({
        user_id: user.id,
        market_id: order.market_id,
        order_id: order.id,
        action: 'order_cancel',
        entity: 'order',
        entity_id: order.id,
      });

      broadcast('orders', { action: 'cancelled', order_id: order.id });
      return { success: true, data: { released } };
    },
  );

  // =========================================================================
  // Routes: Portfolio
  // =========================================================================

  app.get('/api/portfolio', { preHandler: [authRequired] }, async (req, reply) => {
    const user = req.user!;

    const { data: positions } = await supabase
      .from('sp_positions')
      .select('*, sp_markets(*), sp_market_outcomes(*)')
      .eq('user_id', user.id);

    const { data: openOrders } = await supabase
      .from('sp_orders')
      .select('*, sp_markets(*)')
      .eq('user_id', user.id)
      .in('status', ['open', 'partially_filled']);

    const { data: trades } = await supabase
      .from('sp_trades')
      .select('*')
      .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(50);

    return {
      success: true,
      data: {
        balance: user.balance,
        locked_balance: user.locked_balance,
        available_balance: user.balance - user.locked_balance,
        positions,
        open_orders: openOrders,
        trades,
      },
    };
  });

  // =========================================================================
  // Routes: Comments
  // =========================================================================

  app.get('/api/markets/:marketId/comments', async (req, reply) => {
    const { data: comments } = await supabase
      .from('sp_comments')
      .select('*, sp_users(*), replies:sp_comments(*, user:sp_users(*))')
      .eq('market_id', (req.params as any).marketId)
      .is('parent_id', null)
      .order('created_at', { ascending: false });
    return { success: true, data: comments };
  });

  const createCommentSchema = z.object({
    content: z.string().min(1).max(2000),
    parent_id: z.string().optional(),
  });

  app.post(
    '/api/markets/:marketId/comments',
    { preHandler: [authRequired] },
    async (req, reply) => {
      const user = req.user!;
      const { content, parent_id } = createCommentSchema.parse(req.body);

      const now = Date.now();
      const { count } = await supabase
        .from('sp_comments')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', new Date(now - 60 * 1000).toISOString());
      if (count && count >= 5) {
        return reply.code(429).send({ success: false, error: 'Rate limit exceeded' });
      }

      const { data: comment, error } = await supabase
        .from('sp_comments')
        .insert({
          market_id: (req.params as any).marketId,
          user_id: user.id,
          content,
          parent_id,
        })
        .select('*, sp_users(*)')
        .single();
      if (error) return reply.code(500).send({ success: false, error: error.message });

      broadcast('comments', {
        action: 'created',
        market_id: (req.params as any).marketId,
        comment,
      });
      return { success: true, data: comment };
    },
  );

  // =========================================================================
  // Routes: Leaderboard
  // =========================================================================

  app.get('/api/leaderboard', async (req, reply) => {
    const { data: users } = await supabase
      .from('sp_users')
      .select('id, phone_number, name, balance, locked_balance')
      .order('balance', { ascending: false })
      .limit(50);
    return { success: true, data: users };
  });

  // =========================================================================
  // Routes: Admin — Settlement
  // =========================================================================

  const settleMarketSchema = z.object({ result: z.any() });

  app.post(
    '/api/admin/markets/:id/settle',
    { preHandler: [authRequired, adminRequired] },
    async (req, reply) => {
      const user = req.user!;
      const { result } = settleMarketSchema.parse(req.body);
      const { data: market } = await supabase
        .from('sp_markets')
        .select('*, outcomes:sp_market_outcomes(*)')
        .eq('id', (req.params as any).id)
        .single();
      if (!market) return reply.code(404).send({ success: false, error: 'Market not found' });
      if (market.status !== 'open') {
        return reply.code(400).send({ success: false, error: 'Market already settled' });
      }

      const winningName = result.winner || result.outcome;
      const winningOutcome = (market.outcomes ?? []).find((o: any) => o.name === winningName);
      if (!winningOutcome) {
        return reply.code(400).send({ success: false, error: 'Invalid winning outcome' });
      }

      await supabase
        .from('sp_market_outcomes')
        .update({ winning: true })
        .eq('id', winningOutcome.id);

      // Pay 100 points per share of the winning outcome. Every sp_positions row
      // for this market stores yes_shares / no_shares for its outcome.
      const { data: positions } = await supabase
        .from('sp_positions')
        .select('*')
        .eq('market_id', market.id);

      for (const pos of positions ?? []) {
        const shares = winningName === 'YES' ? pos.yes_shares : pos.no_shares;
        const payout = Math.max(0, shares ?? 0) * 100;
        if (payout <= 0) continue;
        await adjustUser(pos.user_id, { balance: payout });
        await recordBalanceChange(pos.user_id, payout, 'settlement_payout', market.id);
      }

      // Cancel every resting order and release its escrow.
      const { data: openOrders } = await supabase
        .from('sp_orders')
        .select('*')
        .eq('market_id', market.id)
        .in('status', ['open', 'partially_filled']);

      for (const order of openOrders ?? []) {
        let released: number;
        try {
          const oc = await supabase
            .from('sp_market_outcomes')
            .select('name')
            .eq('id', order.outcome_id)
            .single();
          released = engine.cancelOrder(market.id, (oc.data?.name ?? 'YES') as 'YES' | 'NO', order.id);
        } catch {
          const perShare = order.side === 'buy' ? order.price : 100 - order.price;
          released = Math.max(0, (order.locked ?? 0) - perShare * (order.filled_qty ?? 0));
        }

        await adjustUser(order.user_id, { locked: -released });
        await recordBalanceChange(order.user_id, released, 'order_cancel_refund', order.id);
        await supabase.from('sp_orders').update({ status: 'cancelled' }).eq('id', order.id);
      }

      await supabase.from('sp_markets').update({
        status: 'settled',
        settled_at: new Date().toISOString(),
        settled_result: result,
      }).eq('id', market.id);

      await supabase.from('sp_audit_logs').insert({
        user_id: user.id,
        market_id: market.id,
        action: 'settlement',
        entity: 'market',
        entity_id: market.id,
        after: result,
      });

      broadcast('markets', { action: 'settled', market_id: market.id, result });
      return { success: true, data: { settled: true, winning_outcome: winningName } };
    },
  );

  // =========================================================================
  // Routes: Admin — Void
  // =========================================================================

  app.post(
    '/api/admin/markets/:id/void',
    { preHandler: [authRequired, adminRequired] },
    async (req, reply) => {
      const user = req.user!;
      const { reason } = z.object({ reason: z.string() }).parse(req.body);
      const { data: market } = await supabase
        .from('sp_markets')
        .select('*, trades:sp_trades(*), orders:sp_orders(*)')
        .eq('id', (req.params as any).id)
        .single();
      if (!market) return reply.code(404).send({ success: false, error: 'Market not found' });

      // Refund exactly what each side paid into the pot.
      for (const trade of market.trades ?? []) {
        const buyerRefund = trade.price * trade.qty;
        const sellerRefund = (100 - trade.price) * trade.qty;

        await adjustUser(trade.buyer_id, { balance: buyerRefund });
        await adjustUser(trade.seller_id, { balance: sellerRefund });

        await recordBalanceChange(trade.buyer_id, buyerRefund, 'void_refund', trade.id);
        await recordBalanceChange(trade.seller_id, sellerRefund, 'void_refund', trade.id);
      }

      for (const order of market.orders ?? []) {
        if (order.status !== 'open' && order.status !== 'partially_filled') continue;

        let released: number;
        try {
          const oc = await supabase
            .from('sp_market_outcomes')
            .select('name')
            .eq('id', order.outcome_id)
            .single();
          released = engine.cancelOrder(market.id, (oc.data?.name ?? 'YES') as 'YES' | 'NO', order.id);
        } catch {
          const perShare = order.side === 'buy' ? order.price : 100 - order.price;
          released = Math.max(0, (order.locked ?? 0) - perShare * (order.filled_qty ?? 0));
        }

        await adjustUser(order.user_id, { locked: -released });
        await recordBalanceChange(order.user_id, released, 'order_cancel_refund', order.id);
        await supabase.from('sp_orders').update({ status: 'cancelled' }).eq('id', order.id);
      }

      await supabase.from('sp_markets').update({
        status: 'voided',
        voided_at: new Date().toISOString(),
        voided_reason: reason,
      }).eq('id', market.id);

      await supabase.from('sp_audit_logs').insert({
        user_id: user.id,
        market_id: market.id,
        action: 'void',
        entity: 'market',
        entity_id: market.id,
        after: { reason },
      });

      broadcast('markets', { action: 'voided', market_id: market.id, reason });
      return { success: true, data: { voided: true } };
    },
  );

  // =========================================================================
  // WebSocket endpoint
  // =========================================================================

  app.get('/api/ws', { websocket: true }, (conn: any) => {
    const id = Math.random().toString(36).slice(2);
    wsClients.set(id, { socket: conn.socket });
    conn.socket.on('message', (msg: any) => {
      try {
        const parsed = JSON.parse(msg);
        if (parsed.channel === 'ping') {
          conn.socket.send(JSON.stringify({ channel: 'pong', ts: new Date().toISOString() }));
        }
      } catch {
        // ignore
      }
    });
    conn.socket.on('close', () => {
      wsClients.delete(id);
    });
  });

  // =========================================================================
  // Start
  // =========================================================================

  try {
    await hydrateEngine();
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`SmartPredict server running on http://localhost:${PORT}`);
    console.log(`REAL_MONEY_ENABLED=${REAL_MONEY_ENABLED}`);
    console.log(`Connected to Supabase: ${SUPABASE_URL}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});
