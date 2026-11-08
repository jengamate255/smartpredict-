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

## Deploy to Render

Render hosts the backend as a single-instance Node.js service. Single-instance matters because the matching engine is in-memory and must be restored from the database on each restart.

### Render service

`render.yaml` at the workspace root defines the service. Connect this GitHub repository in Render → New → Blueprint → `smartpredict/render.yaml`.

### Required environment variables

Set these in Render → Environment Variables:

| Variable | Value | Notes |
|----------|-------|-------|
| `SUPABASE_URL` | `https://vonkqyiczeqhuqhahsxm.supabase.co` | From Supabase Settings → API |
| `SUPABASE_SERVICE_KEY` | `<service-role-key>` | Keep secret; do not commit |
| `NODE_ENV` | `production` | |
| `REAL_MONEY_ENABLED` | `false` | Paper trading only |

### Steps

1. Push source to GitHub (done once):
   ```bash
   git add -A
   git commit -m "feat: deployment ready"
   git push origin main
   ```
2. Create a web service in Render connected to `jengamate255/smartpredict-`.
3. Render uses `render.yaml` automatically (Blueprint).
4. Add `SUPABASE_SERVICE_KEY` manually — it is not in Git.
5. Run the Supabase migration once:
   - Go to https://vonkqyiczeqhuqhahsxm.supabase.co → SQL Editor
   - Paste `packages/server/scripts/seed.sql`
   - Click Run
6. Seed data:
   - Render → Shell → `cd packages/server && npm run db:seed`
   - Or run locally with `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` set.

### Verification

- `GET https://<service>.onrender.com/api/markets` → 12 open markets
- `POST /api/auth/send-otp` with a phone number → OTP sent (dev: code visible in Render logs)

## Deploy the mobile app

### Standalone Android APK (Emulator / direct install)

From this machine:

```powershell
cd packages/mobile
npm install
npx expo prebuild --platform android --no-install
cd android
$env:JAVA_HOME='C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot'
$env:ANDROID_HOME='C:\Android\Sdk'
.\gradlew.bat assembleDebug --no-daemon -PreactNativeArchitectures=x86_64
```

APK output:
`packages/mobile/android/app/build/outputs/apk/debug/app-debug.apk`

Install on any Android emulator or device:

```powershell
adb install -r path/to/app-debug.apk
adb reverse tcp:8081 tcp:8081
adb reverse tcp:3000 tcp:3000
```

### Production mobile build (EAS)

For distribution to other phones via Google Play Store:

1. Install EAS CLI:
   ```bash
   npm install -g eas-cli
   ```
2. Configure app metadata in `packages/mobile/app.json` (name, slug, package).
3. Configure `EXPO_PUBLIC_API_URL` to your Render backend:
   ```bash
   EXPO_PUBLIC_API_URL=https://<your-render-service>.onrender.com/api
   ```
4. Build:
   ```bash
   cd packages/mobile
   eas build --platform android --profile production
   ```

### Pointing the app at your live backend

The mobile app reads `EXPO_PUBLIC_API_URL` (or `localhost:3000/api` in dev mode on Android emulator via `10.0.2.2`). Update it to your Render service URL so other phones can connect from any network.

## Security & compliance reminders

- Never commit `.env`, `.env.*`, signing keys, credentials, or build artifacts. These are blocked by `.gitignore`.
- `SUPABASE_SERVICE_KEY` is server-only and must never ship in the mobile app.
- Politics markets remain disabled until Gaming Board of Tanzania review.
- Points are paper trading points only — no real monetary value.
