# SmartPredict — Forecasting & Prediction Market for Tanzania

Paper-trading prediction market where users trade YES/NO shares on real-world questions using play-money points. No real money. No mobile money. No crypto.

## Architecture

```
smartpredict/
├── package.json              # Root workspace
├── README.md                 # This file
├── packages/
│   ├── engine/               # Matching engine (plain TS, server-side only)
│   │   ├── src/index.ts      # Engine implementation
│   │   ├── src/engine.test.ts # 17 unit tests
│   │   ├── vitest.config.ts
│   │   └── package.json
│   ├── server/               # Fastify + TypeScript backend (Supabase)
│   │   ├── src/index.ts      # API routes, WebSocket, admin settlement
│   │   ├── scripts/seed.sql  # SQL migration for Supabase
│   │   ├── scripts/seed.ts   # Data seeder (uses Supabase client)
│   │   ├── .env              # Supabase credentials
│   │   ├── .env.example      # Environment template
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── mobile/               # Expo + React Native app
│       ├── App.tsx           # All screens (onboarding, home, market, portfolio, etc.)
│       ├── app.json          # Expo config
│       ├── babel.config.js
│       └── package.json
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile | Expo, React Native, TypeScript, React Navigation |
| Backend | Node.js, TypeScript, Fastify, Supabase (PostgreSQL) |
| Matching Engine | Plain TypeScript module (server-side only) |
| Database | Supabase (shared with Smartsoko project) |
| Real-time | WebSocket (@fastify/websocket) |
| Auth | Phone number + OTP |
| Testing | Vitest (engine) |

## Prerequisites

- Node.js 20+
- npm
- Access to Smartsoko Supabase instance (already configured in `.env`)

## Setup

### 1. Install dependencies

```bash
cd smartpredict
npm install
```

### 2. Create SmartPredict tables in Supabase

The Smartsoko Supabase instance is already configured in `packages/server/.env`:

```
SUPABASE_URL=https://vonkqyiczeqhuqhahsxm.supabase.co
SUPABASE_SERVICE_KEY=<service-role-key>
```

Run the SQL migration in the Supabase SQL Editor:

```bash
# Option A: Run via Supabase Dashboard
# 1. Go to https://vonkqyiczeqhuqhahsxm.supabase.co
# 2. Open SQL Editor
# 3. Paste and run: packages/server/scripts/seed.sql

# Option B: Run via psql (if you have direct access)
psql $SUPABASE_DIRECT_URL -f packages/server/scripts/seed.sql
```

### 3. Seed data

```bash
cd packages/server
npm run db:seed
```

### 4. Start the server

```bash
npm run dev   # http://localhost:3000
```

### 5. Mobile app

```bash
cd ../mobile
npx expo start
```

## Running Tests

```bash
# Engine tests (17 unit tests)
cd packages/engine
npm test

# All engine tests should pass:
# ✓ Escrow: lock, reject, release, partial cancel
# ✓ Matching: resting price, partial fills, price/time priority, self-trade prevention
# ✓ Market makers: escrow lock, cancel release
# ✓ Settlement: YES/NO payouts
# ✓ Spread and mid price
# ✓ Point conservation
```

## API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/send-otp` | Send OTP to phone number |
| POST | `/api/auth/verify-otp` | Verify OTP, get JWT token |

### Markets
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/markets` | List markets (filter by category, status) |
| GET | `/api/markets/:id` | Market detail with order book |
| POST | `/api/markets` | Admin: create market |

### Orders
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/orders` | Place a limit order |
| DELETE | `/api/orders/:id` | Cancel an open order |

### Portfolio
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/portfolio` | User balance, positions, open orders, trades |

### Comments
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/markets/:marketId/comments` | Get comments for a market |
| POST | `/api/markets/:marketId/comments` | Add a comment (rate limited: 5/min) |

### Leaderboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/leaderboard` | Top forecasters by balance |

### Admin — Settlement
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/markets/:id/settle` | Settle market with official result |
| POST | `/api/admin/markets/:id/void` | Void market, refund all trades |

### WebSocket
| Endpoint | Description |
|----------|-------------|
| `GET /api/ws` | Real-time order book and price updates |

## Seed Data

12 markets across 5 categories:

| Category | Markets |
|----------|---------|
| Uchumi (Economy) | USD/TZS close, BOT rate decision, inflation, fuel price, GDP |
| Michezo (Sports) | Taifa Stars, Simba SC, Yanga SC |
| Hali ya Hewa (Weather) | Dar es Salaam rainfall, temperature |
| Teknolojia (Tech) | Product launches, Starlink |
| Siasi (Politics) | **Disabled by default** — requires legal review |

Two house market makers seed liquidity on every market outcome (4-point spread around mid price 50).

Two demo traders start with play-money points (2,500 and 1,800).

## Compliance & Safety

- **Paper trading only**: Points have no cash value. Shown on first launch and in settings.
- `REAL_MONEY_ENABLED` feature flag defaults to `false`. Gates all deposit/withdrawal paths.
- Real-money use in Tanzania requires Gaming Board of Tanzania licensing and Bank of Tanzania clarity on crypto/stablecoins before the flag is ever switched on.
- No M-Pesa, Tigo Pesa, or crypto integration in this phase.

## Matching Engine Rules

- **Price-time priority**: Trades execute at the resting order's price.
- **Price range**: 1–99 points per share.
- **Escrow**: Worst-case cost locked on order placement. Released on cancel or fill.
- **No self-trades**: Users cannot trade with their own orders.
- **Settlement**: Admin enters official value; 100 points paid per winning share.
- **Void**: Refunds every trade at entry price if market is ill-defined.
- **Audit log**: Append-only record of every order, trade, balance change, and settlement.
- **Point conservation**: Total points conserved before and after settlement.

## Phase Two (Proposed)

- Switch `REAL_MONEY_ENABLED` to `true` after legal clearance
- Shilling-pegged stablecoin integration
- M-Pesa / Tigo Pesa deposits and withdrawals
- Market orders (in addition to limit orders)
- Price alerts and market-close reminders (push notifications)
- Multi-outcome market UI improvements
- Advanced charting (1D, 1W, 1M, All)
