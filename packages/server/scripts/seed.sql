-- SmartPredict tables migration for Supabase
-- Run this against the Smartsoko Supabase database:
-- https://vonkqyiczeqhuqhahsxm.supabase.co
-- Using the service role key for admin access

-- ============================================
-- Feature flags
-- ============================================
CREATE TABLE IF NOT EXISTS feature_flags (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN DEFAULT false,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by TEXT DEFAULT 'system'
);

INSERT INTO feature_flags (key, enabled, updated_by)
VALUES ('REAL_MONEY_ENABLED', false, 'system')
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- SmartPredict users (extends profiles)
-- ============================================
CREATE TABLE IF NOT EXISTS sp_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT UNIQUE NOT NULL,
  name TEXT,
  balance INTEGER DEFAULT 1000,
  locked_balance INTEGER DEFAULT 0,
  role TEXT DEFAULT 'user', -- user | market_maker | admin
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- Markets
-- ============================================
CREATE TABLE IF NOT EXISTS sp_markets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  category TEXT NOT NULL, -- uchumi | michezo | hewa | teknolojia | siasa
  status TEXT DEFAULT 'open', -- open | closed | settled | voided
  outcome_type TEXT DEFAULT 'binary', -- binary | multi
  resolution_source TEXT NOT NULL,
  resolution_source_url TEXT NOT NULL,
  close_at TIMESTAMP WITH TIME ZONE NOT NULL,
  settled_at TIMESTAMP WITH TIME ZONE,
  settled_result JSONB,
  voided_at TIMESTAMP WITH TIME ZONE,
  voided_reason TEXT,
  created_by UUID REFERENCES sp_users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- Market outcomes
-- ============================================
CREATE TABLE IF NOT EXISTS sp_market_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID REFERENCES sp_markets(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- YES | NO | 2600-2700 | ...
  order_index INTEGER DEFAULT 0,
  winning BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sp_market_outcomes_market_id ON sp_market_outcomes(market_id);

-- ============================================
-- Orders
-- ============================================
CREATE TABLE IF NOT EXISTS sp_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID REFERENCES sp_markets(id) ON DELETE CASCADE,
  user_id UUID REFERENCES sp_users(id) ON DELETE CASCADE,
  outcome_id UUID REFERENCES sp_market_outcomes(id) ON DELETE CASCADE,
  side TEXT NOT NULL, -- buy | sell
  price INTEGER NOT NULL, -- 1-99
  qty INTEGER NOT NULL,
  filled_qty INTEGER DEFAULT 0,
  locked INTEGER NOT NULL,
  status TEXT DEFAULT 'open', -- open | partially_filled | filled | cancelled
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sp_orders_market_id ON sp_orders(market_id);
CREATE INDEX IF NOT EXISTS idx_sp_orders_user_id ON sp_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_sp_orders_status ON sp_orders(status);

-- ============================================
-- Trades
-- ============================================
CREATE TABLE IF NOT EXISTS sp_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID REFERENCES sp_markets(id) ON DELETE CASCADE,
  order_id UUID REFERENCES sp_orders(id) ON DELETE CASCADE,
  buyer_id UUID REFERENCES sp_users(id) ON DELETE CASCADE,
  seller_id UUID REFERENCES sp_users(id) ON DELETE CASCADE,
  outcome_id UUID REFERENCES sp_market_outcomes(id) ON DELETE CASCADE,
  price INTEGER NOT NULL,
  qty INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sp_trades_market_id ON sp_trades(market_id);
CREATE INDEX IF NOT EXISTS idx_sp_trades_buyer_id ON sp_trades(buyer_id);
CREATE INDEX IF NOT EXISTS idx_sp_trades_seller_id ON sp_trades(seller_id);
CREATE INDEX IF NOT EXISTS idx_sp_trades_created_at ON sp_trades(created_at);

-- ============================================
-- Positions
-- ============================================
CREATE TABLE IF NOT EXISTS sp_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES sp_users(id) ON DELETE CASCADE,
  market_id UUID REFERENCES sp_markets(id) ON DELETE CASCADE,
  outcome_id UUID REFERENCES sp_market_outcomes(id) ON DELETE CASCADE,
  qty INTEGER DEFAULT 0,
  avg_price INTEGER DEFAULT 0,
  yes_shares INTEGER DEFAULT 0,
  no_shares INTEGER DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, market_id, outcome_id)
);

CREATE INDEX IF NOT EXISTS idx_sp_positions_user_id ON sp_positions(user_id);

-- ============================================
-- Balance changes (append-only ledger)
-- ============================================
CREATE TABLE IF NOT EXISTS sp_balance_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES sp_users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL, -- positive = credit, negative = debit
  reason TEXT NOT NULL, -- trade_escrow_lock | trade_escrow_release | settlement_payout | void_refund | order_cancel_refund
  reference TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sp_balance_changes_user_id ON sp_balance_changes(user_id);
CREATE INDEX IF NOT EXISTS idx_sp_balance_changes_created_at ON sp_balance_changes(created_at);

-- ============================================
-- Comments
-- ============================================
CREATE TABLE IF NOT EXISTS sp_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID REFERENCES sp_markets(id) ON DELETE CASCADE,
  user_id UUID REFERENCES sp_users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES sp_comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  likes INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sp_comments_market_id ON sp_comments(market_id);
CREATE INDEX IF NOT EXISTS idx_sp_comments_parent_id ON sp_comments(parent_id);

-- ============================================
-- Comment likes
-- ============================================
CREATE TABLE IF NOT EXISTS sp_comment_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID REFERENCES sp_comments(id) ON DELETE CASCADE,
  user_id UUID REFERENCES sp_users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(comment_id, user_id)
);

-- ============================================
-- Audit log (append-only)
-- ============================================
CREATE TABLE IF NOT EXISTS sp_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES sp_users(id) ON DELETE SET NULL,
  market_id UUID REFERENCES sp_markets(id) ON DELETE SET NULL,
  order_id UUID REFERENCES sp_orders(id) ON DELETE SET NULL,
  trade_id UUID REFERENCES sp_trades(id) ON DELETE SET NULL,
  comment_id UUID REFERENCES sp_comments(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  before JSONB,
  after JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sp_audit_logs_created_at ON sp_audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_sp_audit_logs_user_id ON sp_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_sp_audit_logs_market_id ON sp_audit_logs(market_id);

-- ============================================
-- Sessions
-- ============================================
CREATE TABLE IF NOT EXISTS sp_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES sp_users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sp_sessions_token ON sp_sessions(token);

-- ============================================
-- Row Level Security
-- ============================================
ALTER TABLE sp_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sp_markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE sp_market_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sp_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE sp_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE sp_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sp_balance_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sp_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sp_comment_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sp_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sp_sessions ENABLE ROW LEVEL SECURITY;

-- Users can view their own data
DROP POLICY IF EXISTS "Users can view own profile" ON sp_users;
DROP POLICY IF EXISTS "Users can view own orders" ON sp_orders;
DROP POLICY IF EXISTS "Users can view own positions" ON sp_positions;
DROP POLICY IF EXISTS "Users can view own balance changes" ON sp_balance_changes;
DROP POLICY IF EXISTS "Users can view own sessions" ON sp_sessions;
DROP POLICY IF EXISTS "Users can view own comments" ON sp_comments;
DROP POLICY IF EXISTS "Anyone can view open markets" ON sp_markets;
DROP POLICY IF EXISTS "Anyone can view market outcomes" ON sp_market_outcomes;
DROP POLICY IF EXISTS "Anyone can view trades" ON sp_trades;
DROP POLICY IF EXISTS "Anyone can view comments" ON sp_comments;

CREATE POLICY "Users can view own profile" ON sp_users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can view own orders" ON sp_orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view own positions" ON sp_positions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view own balance changes" ON sp_balance_changes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view own sessions" ON sp_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view own comments" ON sp_comments FOR SELECT USING (auth.uid() = user_id);

-- Markets are viewable by all (except siasa when disabled via app logic)
CREATE POLICY "Anyone can view open markets" ON sp_markets FOR SELECT USING (status = 'open');
CREATE POLICY "Anyone can view market outcomes" ON sp_market_outcomes FOR SELECT USING (true);
CREATE POLICY "Anyone can view trades" ON sp_trades FOR SELECT USING (true);
CREATE POLICY "Anyone can view comments" ON sp_comments FOR SELECT USING (true);

-- ============================================
-- Seed: market maker accounts
-- ============================================
-- Note: Market maker users need to be inserted via the app (OTP auth)
-- or manually via SQL with specific phone numbers.

-- ============================================
-- Helper: update_updated_at trigger
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_sp_users_updated_at ON sp_users;
DROP TRIGGER IF EXISTS update_sp_markets_updated_at ON sp_markets;
DROP TRIGGER IF EXISTS update_sp_comments_updated_at ON sp_comments;

CREATE TRIGGER update_sp_users_updated_at BEFORE UPDATE ON sp_users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_sp_markets_updated_at BEFORE UPDATE ON sp_markets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_sp_comments_updated_at BEFORE UPDATE ON sp_comments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Done
-- ============================================
SELECT 'SmartPredict tables created successfully' as status;
