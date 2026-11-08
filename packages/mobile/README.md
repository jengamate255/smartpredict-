# Kesho mobile UI (SmartPredict backend)

Native React Native screens adapted from the Kesho reference designs. No WebView.

- **Masoko:** combined search/category filtering, spotlight, API-backed quotes.
- **Detail:** recorded trade prices, timeframe filters, YES order book, source link.
- **Trade:** YES/NO, current ask or custom limit, whole-share budget calculation,
  API-confirmed fill/remaining-order receipt.
- **Pochi:** available/locked points, active/settled positions, trade history,
  cancellation of resting orders, sign-out.

All balances use **PT (practice points)**. Winning contracts pay 100 PT each.
No mobile-money integration, deposit, withdrawal, fake P&L, or regulatory claims.
Politics and multi-outcome trading are disabled in this UI. No automatic cashout.
Quote buttons use each outcome's actual ask (not a fabricated complementary price).
Charts intentionally show an empty state until recorded trades exist.

## Development

Run the backend on port 3000, then from this directory:

```powershell
npm.cmd install
npm.cmd test
npx.cmd tsc --noEmit
npx.cmd expo start --port 8081
```

The Android emulator uses `http://10.0.2.2:3000/api` by default. For a physical
device, set `EXPO_PUBLIC_API_URL` to the development machine's LAN API address.
Never put service-role keys or database credentials in the mobile environment.
Development OTPs are auto-filled only in `__DEV__` mode.

The existing SDK 50 debug APK needs Metro running; this is not a standalone
production release. SDK/dependency upgrades and backend concurrency hardening
remain separate production-readiness work.

## Android build (Windows)

```powershell
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot'
$env:ANDROID_HOME = 'C:\Android\Sdk'
cd android
.\gradlew.bat assembleDebug --no-daemon -PreactNativeArchitectures=x86_64
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk` (x86_64 emulator).
Metro's workspace configuration excludes native build output and resolves app
dependencies before hoisted workspace copies. SDK 50's older CLI has a known
Node 24/Windows `node:sea` shim-path issue; use a compatible Node version when
reinstalling the CLI rather than relying on a modified dependency installation.

## Verified on emulator-5554, Android API 35

- TypeScript check; five calculation/filter/eligibility unit tests.
- Sign out, OTP sign-in, all four bottom tabs.
- Search `USD` returns two matching markets; combining `USD` with sports gives
  the empty state; clearing filters restores the feed.
- YES/NO sheet selector and trade-history timeframe selector.
- 100 PT budget at 51 PT requests one whole share; actual fill at 51 PT is shown.
- Portfolio balance changed 3,919 → 3,868 PT; the new YES position appeared.
- Limit buy at 10 PT requested 10 shares and locked 100 PT without a fill.
- Wallet cancellation restored available balance 3,768 → 3,868 PT.
- SVG chart rendered the new recorded trade, not example chart data.

`scripts/emulator.cjs` provides ADB dump/tap/wait/screenshot helpers for repeating
native UI checks. It defaults to emulator-5554; override `ANDROID_SERIAL` and
`ADB_PATH` as needed. Screenshot files go to the approved OpenCode temp folder.
