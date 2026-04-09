# Alpha Portfolio Tracker

<div align="center">
  <img src="public/screenshots/live.png" alt="Live" width="49%" />
  <img src="public/screenshots/dashboard.png" alt="Dashboard" width="49%" />
</div>

A self-hosted portfolio tracking application for Indian stock markets with real-time market data, historical performance analysis, and comprehensive reporting. Built with Next.js and powered by Upstox API.

> [!NOTE]
> This project has been tested with **Upstox** (for real-time market data, historical prices, and authentication) and **Zerodha Kite** (for order import only). If you use a different broker, you can still use the app by importing trades via Excel, but real-time data and order sync features may require code changes to support your broker's API.

## ✨ Features

- **Real-time Dashboard** — Live portfolio P&L with WebSocket price streaming from Upstox
- **Momentum Screener** — Daily-ranked NSE universe using composite Sharpe + ATH-proximity scoring, with exit signal detection for portfolio holdings
- **Privacy Mode** — Toggle to hide monetary values on desktop (great for screen sharing)
- **Performance Analytics** — NAV tracking, XIRR, drawdown, benchmark comparisons (NIFTY 50, NIFTY 500 MOMENTUM 50, etc.)
- **Market Cap Classification** — Automatic Large/Mid/Small/Micro cap breakdown using AMFI data
- **Sector Allocation** — Visual treemap and pie charts showing portfolio sector exposure
- **Portfolio Heatmap** — Color-coded view of stock performance across your holdings
- **Intraday P&L Chart** — Minute-by-minute P&L tracking with index overlay
- **Corporate Actions** — Track stock splits, bonuses, and symbol changes with automatic price adjustments
- **Trade Import** — Bulk import trades from Excel/CSV files
- **Historical Snapshots** — Daily, weekly, and monthly portfolio snapshots with time-weighted returns
- **Data Lock** — Protect historical data from accidental recalculation

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+ and npm
- A [Neon](https://neon.tech/) account (free tier is sufficient)
- An [Upstox](https://upstox.com/) demat account
- [Android Studio](https://developer.android.com/studio) *(Optional: only needed if building the Android app)*

---

### Step 1: Get an Upstox Analytics Token

1. Go to [developer.upstox.com](https://developer.upstox.com/) and sign in with your Upstox credentials
2. Navigate to the **Analytics** tab on your Developer Apps page
3. Click **"Generate Token"** and confirm
4. Copy the token — you'll add it to `.env.local` in Step 3

That's it! No OAuth app, no redirect URLs, no daily token refresh needed.

> [!TIP]
> The Analytics Token provides read-only access to all market data APIs (quotes, historical data, WebSocket streaming) with 1-year validity. Since this app only reads market data and doesn't place orders, the Analytics Token is all you need. See [Upstox docs](https://upstox.com/developer/api-documentation/analytics-token/) for details.

---

### Step 2: Create a Neon Postgres Database

1. Sign up at [neon.tech](https://neon.tech/) (or connect via Vercel integration)
2. Create a new project (e.g., `alpha-portfolio`)
3. Go to your project's **Dashboard → Connection Details**
4. Copy the **connection string** — it looks like:
   ```
   postgresql://user:password@ep-xxx.region.aws.neon.tech/neondb?sslmode=require
   ```

<details>
<summary>💰 Neon Free Tier Limits</summary>

| Feature | Free Tier |
|---------|-----------|
| Storage | 0.5 GB |
| Projects | 10 |
| Compute | 100 CU-hours/month (0.25 CU) |
| Row Writes | Unlimited |

**Is 100 CU-hours/month enough?**  
Yes — easily. At 0.25 CU, that's 400 hours of active compute. Our workload (daily pipeline cron ~2 min/day + web queries) uses roughly 3–4 CU-hours/month — about 4% of the limit. The compute auto-suspends when idle (5 min timeout), so you're only billed for actual active time.

</details>

---

### Step 3: Clone & Configure

```bash
# Clone the repository
git clone https://github.com/<your-username>/Alpha.git
cd Alpha

# Copy environment templates
cp .env.local.example .env.local
cp .env.example .env
```

Edit `.env.local` with your values:

```bash
# Database (Neon Postgres)
DATABASE_URL=postgresql://user:password@ep-xxx.region.aws.neon.tech/neondb?sslmode=require

# Upstox Analytics Token
UPSTOX_ANALYTICS_TOKEN=your-analytics-token

# Zerodha Kite Connect (Optional - for order sync)
# ZERODHA_USER_ID=your-user-id
# ZERODHA_PASSWORD=your-password
# ZERODHA_TOTP_SECRET=your-totp-secret
# ZERODHA_API_KEY=your-kite-api-key
# ZERODHA_API_SECRET=your-kite-api-secret
```

---

### Step 4: Install & Initialize

```bash
# Install dependencies
npm install

# Push database schema to Neon
npm run db:setup
```

> [!IMPORTANT]
> **Database Initialization**: You MUST specify `DATABASE_URL` in your `.env.local` for the script to connect to Neon. Run `npm run db:setup` to create the tables in your Neon database. If you see a "no such table" error in the app, it means this step was skipped or failed.

---

### Step 5: Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

The app picks up the Analytics Token from `.env.local` automatically — no login needed.

---

### Step 6: Import Your Trades

Go to the **Trades** page (`/trades`) and upload an Excel file with your trade history. The expected format:

| Column | Description |
|--------|-------------|
| Date | Trade date (DD-MM-YYYY or YYYY-MM-DD) |
| Symbol | NSE trading symbol (e.g., RELIANCE, TCS) |
| Type | BUY or SELL |
| Quantity | Number of shares |
| Price | Price per share |

After import, the app will automatically:
- Process all transactions chronologically
- Fetch historical prices from Upstox API
- Calculate daily NAV using Time-Weighted Return (TWR)
- Generate daily, weekly, and monthly snapshots
- Compare against benchmark indices

---

## ☁️ Deploy to Vercel

### Step 1: Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/<your-username>/Alpha.git
git push -u origin main
```

### Step 2: Import to Vercel

1. Go to [vercel.com](https://vercel.com/) and sign in
2. Click **"New Project"** → Import your GitHub repository
3. In **Environment Variables**, add:

| Variable | Value | Notes |
|----------|-------|-------|
| `DATABASE_URL` | `postgresql://user:pass@host.neon.tech/dbname?sslmode=require` | Neon connection string |
| `UPSTOX_ANALYTICS_TOKEN` | Your analytics token | From Developer Apps → Analytics tab. Mark as **Sensitive** |
| `CRON_SECRET` | A random string | Required for cron endpoint auth |

> [!TIP]
> If you are using the optional **Zerodha Order Sync**, you should also add the `ZERODHA_*` variables listed in the [Environment Variables Reference](#zerodha-kite-integration) below.

4. Click **Deploy**

### Step 3: Set Up Cron Jobs

The app uses external cron jobs to automate daily tasks. Use [cron-job.org](https://cron-job.org/) (free tier is sufficient).

#### How to set up on cron-job.org

1. Sign up at [cron-job.org](https://cron-job.org/) (free account)
2. Click **"Create cronjob"**
3. For each job below, fill in:
   - **Title**: A descriptive name (e.g., "Alpha - Daily Snapshot")
   - **URL**: `https://your-app.vercel.app` + the endpoint path + `?secret=YOUR_CRON_SECRET`
   - **Schedule**: Use the "Custom" option and paste the cron expression
   - **Time zone**: Set to **UTC** for all jobs
   - **Request method**: **GET**
   - **Notifications**: Enable "on failure" to get alerted if a job fails
4. Click **"Create"** and repeat for each endpoint

> [!IMPORTANT]
> All cron endpoints require authentication via `CRON_SECRET`. Append `?secret=YOUR_CRON_SECRET` to each URL, or set the `Authorization: Bearer YOUR_CRON_SECRET` header. Without this, endpoints return 401 in production.

#### Cron Jobs to Configure

| # | Title | Endpoint | Schedule (UTC) | IST | What it does |
|---|-------|----------|----------------|-----|--------------|
| 1 | Intraday P/L | `/api/cron/intraday-pnl` | `* 4-10 * * 1-5` | Every min (9:30am-4:00pm) | Records P/L every minute to power the Intraday chart. |
| 2 | Daily Snapshot | `/api/portfolio/snapshot?type=daily` | `30 10 * * 1-5` | 4:00 PM Mon-Fri | End-of-day portfolio value, NAV, drawdown. |
| 3 | Weekly Snapshot | `/api/portfolio/snapshot?type=weekly` | `0 11 * * 5` | 4:30 PM Fri | Weekly state (market cap, sector, XIRR). |
| 4 | Monthly Snapshot | `/api/portfolio/snapshot?type=month` | `0 0 1 * *` | 5:30 AM 1st of month | Monthly state with full performance stats. |
| 5 | Corp Actions | `/api/cron/corporate-actions` | `30 23 * * *` | 5:00 AM Daily | Syncs splits and bonuses from NSE automatically. |
| 6 | Sector Refresh | `/api/cron/sector-refresh` | `0 6 1 * *` | 11:30 AM 1st of month | Scrapes latest stock-to-sector mappings. |
| 7 | AMFI Sync | `/api/cron/amfi-sync` | `30 0 * * 0` | 6:00 AM Sunday | Weekly check for new market cap classifications. |
| 8 | Momentum Screener | `/api/cron/momentum-screener` | `0 11 * * 1-5` | 4:30 PM Mon-Fri | Fetches candles, scores all stocks, updates rankings. |

> [!TIP]
> After setting up all 6 jobs, you should see them listed in your cron-job.org dashboard. You can manually trigger any job by clicking "Run now" to test it.

---

## ⚙️ Settings Page

The Settings page (`/settings`) is your control center for managing the app:

### Upstox Authentication

Set `UPSTOX_ANALYTICS_TOKEN` in `.env.local`. The Analytics Token is a long-lived (1-year) read-only token — no login, no refresh, no cron jobs needed. The Settings page shows the token status.

### Data Lock

Set a date to protect all historical snapshot data before that date from being modified or recalculated. Useful once you've verified your historical data is correct.

### Recompute Snapshots

Trigger a full recalculation of portfolio snapshots from your trade history. This processes all transactions chronologically, fetches prices, and regenerates all daily/weekly/monthly snapshots. Use this after importing new trades or fixing data issues.

### Refresh Sector Data

Fetches the latest stock-to-sector mappings (scrapes from Zerodha). This data powers the sector allocation charts. Runs automatically monthly via cron, but can be triggered manually.

---

## 📊 AMFI Market Cap Classification

The app classifies your holdings into Large Cap, Mid Cap, Small Cap, and Micro Cap using official AMFI (Association of Mutual Funds in India) data.

### How to Upload AMFI Data

1. Download the AMFI classification PDF from [amfiindia.com](https://www.amfiindia.com/research-information/other-data/categorization-of-stocks)
2. Go to **Settings** → **AMFI Classification** card
3. Upload the PDF file
4. The app parses it and stores classifications by period (e.g., `2024_H2`)

### Classification Logic

- AMFI releases data twice a year (H1 and H2)
- The **rolling period** logic ensures the previous period's data applies to the current period's snapshots (e.g., `2024_H2` data determines classifications until `2025_H1` data is available)
- **SEBI thresholds**: Large Cap (rank 1–100), Mid Cap (101–250), Small Cap (251–500), Micro Cap (501+)

After uploading new AMFI data, snapshots are automatically recalculated to update the market cap breakdown.

---

## 🏢 Corporate Actions

Go to **Settings** → **Corporate Actions** to manage stock splits, bonuses, and symbol changes.

### Supported Types

| Type | Description | Example |
|------|-------------|---------|
| **SPLIT** | Stock split — adjusts quantity and price | 1:5 split → 100 shares become 500 at 1/5th price |
| **BONUS** | Bonus shares — adds new shares at zero cost | 1:1 bonus → 100 shares become 200 |
| **SYMBOL_CHANGE** | Symbol rename — maps old symbol to new | MCDOWELL-N → UBBL |

### How It Works

1. Add the corporate action with the date, symbol, type, and ratio
2. The app automatically adjusts historical prices and quantities in snapshot calculations
3. No need to modify your original trade data — adjustments are applied during portfolio simulation

> [!NOTE]
> Corporate actions are not auto-detected from any API. You need to manually enter them when they occur for your holdings.

---

## 🕶️ Privacy Mode

Click the **eye icon** in the live dashboard header to toggle privacy mode:
- **On**: All monetary values (portfolio value, P&L, stock values) are masked with `****` on desktop
- **Off**: All values are visible
- **Mobile**: Values are always shown regardless of privacy setting (since you're on your personal device)
- The setting persists across sessions via `localStorage`

---

## 📈 Momentum Screener

Scores the full NSE equity universe daily after market close. Mirrors the backtest engine exactly.

### Formula

```
Composite Score = 0.5 × avgSharpe + 0.5 × athProximity
```

- **avgSharpe** = mean of Sharpe(12m), Sharpe(6m), Sharpe(3m) — annualized, sample std, risk-free = 0
- **Sharpe windows**: 12m (252 days), 6m (126 days), 3m (62 days ending 21 days ago)
- **athProximity** = currentClose / allTimeHigh — range [0, 1]

### Filters (all must pass)

| Filter | Threshold |
|--------|-----------|
| Market cap | ≥ ₹1,000 Cr (NSE Bhavcopy) |
| Price | ≥ ₹50 (ETFs GOLDBEES/SILVERBEES exempt) |
| 200 DMA | Close ≥ 200-day SMA |
| ATH proximity | Within 30% of all-time high |
| Volume | Median daily turnover ≥ ₹1 Cr (126-day lookback) |
| Circuit band | ≥ 15% (excludes 2%/5% circuit stocks) |
| History | ≥ 269 trading days of data |

### One-Time Setup (first deploy)

```bash
# Backfill ~18 months of daily candles (~2000 stocks, ~30 mins)
npx ts-node -e "require('./scripts/seed-screener-prices.ts')"

# Seed all-time highs from monthly candles since 2000 (~7 mins)
npx ts-node -e "require('./scripts/seed-ath.ts')"

# Backfill 50 days of ranking history
npx ts-node -e "require('./scripts/backfill-rankings.ts')"
```

After backfill, the daily cron (`/api/cron/momentum-screener`, weekdays 4:30 PM IST) keeps everything up to date incrementally.

### Exit Signals

Portfolio holdings get an exit signal when:
- **Rank > 50** or **unranked** (fell out of screener filters), OR
- **Below 200 DMA** AND **> 25% from ATH** simultaneously

Holdings held < 14 days are **LOCKED** (min hold protection, displayed in yellow).

---

## 🏗️ Architecture

<details>
<summary>Click to expand</summary>

### Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Database**: Neon Postgres (serverless PostgreSQL)
- **ORM**: Prisma
- **Market Data**: Upstox API (REST + WebSocket)
- **Styling**: TailwindCSS + Material UI
- **Charts**: Recharts + Nivo

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js App Router)                    │
├─────────────────────────────────────────────────────────────────────┤
│  Live Dashboard │ Historical Dashboard │ Trades │ Settings          │
│       │                │                   │         │              │
│       └────────────────┴───────────────────┴─────────┘              │
│                              │                                      │
│                    Server Actions / API Routes                      │
├─────────────────────────────────────────────────────────────────────┤
│                           Service Layer                             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐     │
│  │ Upstox  │ │  AMFI   │ │ Finance │ │ Import  │ │ Sector  │     │
│  │ Service │ │ Service │ │ Engine  │ │ Service │ │ Service │     │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘     │
├───────┼──────────┼──────────┼──────────┼──────────┼─────────────────┤
│       │          │          │          │          │                  │
│  ┌────▼────┐ ┌───▼───┐ ┌───▼───┐ ┌───▼───┐ ┌───▼───┐             │
│  │ Upstox  │ │ AMFI  │ │Prisma │ │ Excel │ │Zerodha│             │
│  │   API   │ │ Files │ │  ORM  │ │ Parse │ │ Scrape│             │
│  └─────────┘ └───────┘ └───┬───┘ └───────┘ └───────┘             │
├──────────────────────────────┼──────────────────────────────────────┤
│                        ┌─────▼─────┐                                │
│                        │   Neon    │                                │
│                        │ Postgres  │                                │
│                        └───────────┘                                │
└─────────────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── actions/           # Server Actions
│   │   ├── actions.ts     # Core portfolio actions
│   │   ├── screener.ts    # Screener data & exit signal detection
│   │   ├── auth.ts        # Authentication actions
│   │   ├── amfi.ts        # AMFI classification actions
│   │   ├── live.ts        # Live dashboard data
│   │   └── sectors.ts     # Sector mapping actions
│   ├── api/               # API Routes
│   │   ├── cron/          # Scheduled jobs (snapshot, screener, sector, corp actions)
│   │   ├── stream/        # WebSocket authorization
│   │   └── portfolio/     # Snapshot generation
│   ├── screener/          # Momentum screener page
│   ├── dashboard/         # Historical dashboard page
│   ├── settings/          # Settings page (auth, AMFI, corp actions)
│   └── trades/            # Trade management & import
├── components/            # React components
│   ├── screener/          # ScreenerClient, StatsBar, RulesInfoModal
│   ├── live/              # LiveHeader, LiveStatsCards, LiveMovers, IntradayPnLChart
│   └── portfolio/         # PortfolioTable, Heatmap, SectorAllocation
├── context/
│   └── LiveDataContext.tsx # WebSocket + polling data provider
├── hooks/
│   └── useUpstoxStream.ts # WebSocket connection to Upstox (Protobuf V3)
└── lib/                   # Core library code
    ├── screener/          # Momentum screener pipeline
    │   ├── pipeline.ts    # Daily orchestrator (candles → score → rank → store)
    │   ├── scoring.ts     # Sharpe + composite score (mirrors backtest engine.py)
    │   ├── prices.ts      # Incremental candle ingestion from Upstox
    │   ├── ath.ts         # All-time high tracking
    │   ├── bhavcopy.ts    # NSE market cap from daily ZIP archives
    │   ├── corporate-actions.ts # Split/bonus detection via price anomalies
    │   ├── dates.ts       # IST date utilities
    │   └── utils.ts       # Shared withConcurrency / withRetry helpers
    ├── upstox/            # Upstox API client & token management
    ├── amfi/              # AMFI classification service
    ├── finance/           # Portfolio valuation engine
    ├── portfolio-engine.ts # Transaction processing
    ├── finance.ts         # Snapshot calculations
    └── db.ts              # Database connection
```

### Database Schema

**Core Tables**: Transaction, DailyPortfolioSnapshot, WeeklyPortfolioSnapshot, MonthlyPortfolioSnapshot

**Support Tables**: StockHistory, IndexHistory, SymbolMapping, AMFIClassification, SectorMapping, UpstoxToken, IntradayPnL

### Real-time Data Flow

```
Page Load → Fetch initial data (Server Action)
               │
               ▼
          Start WebSocket (useUpstoxStream)
               │
               ▼
          Receive price updates → Update holdings → Recalculate totals
```

The browser connects directly to Upstox WebSocket (protobuf messages decoded client-side). This avoids serverless connection limits while providing sub-second price updates.

### Snapshot Calculation

Portfolio history is built through simulation:
1. Process transactions chronologically
2. Fetch daily closing prices from Upstox
3. Apply corporate action adjustments
4. Calculate NAV using Time-Weighted Return (TWR)
5. Save daily/weekly/monthly snapshots
6. Track index benchmarks for comparison

</details>

---

## 🔧 Optional: Zerodha Kite Integration

If you want to auto-sync orders from Zerodha Kite:

> [!NOTE]
> Auto-sync only imports the **current day's executed orders** — it does not import historical trades. For your existing trade history, use the Excel import on the Trades page.

1. Create a Kite Connect app at [kite.trade](https://kite.trade/)
2. Add Zerodha credentials to your `.env.local`:
   ```bash
   ZERODHA_USER_ID=your-user-id
   ZERODHA_PASSWORD=your-password
   ZERODHA_TOTP_SECRET=your-totp-secret
   ZERODHA_API_KEY=your-kite-api-key
   ZERODHA_API_SECRET=your-kite-api-secret
   ```
3. Set up a GitHub Action for daily sync (see `.github/workflows/sync-orders.yml`)
4. Add the same secrets to your GitHub repository **Settings → Secrets**

---

## 🔑 Environment Variables Reference

### Required (Core)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Neon Postgres connection string (`postgresql://...?sslmode=require`) |
| `UPSTOX_ANALYTICS_TOKEN` | Long-lived (1-year) read-only token. Generate at Developer Apps → Analytics tab. |

### Optional — Personalization

| Variable | Used For | Description |
|----------|----------|-------------|
| `APP_USER_NAME` | UI greeting (server) | Display name shown in the app (default: "User") |
| `NEXT_PUBLIC_APP_USER_NAME` | UI greeting (client) | Same as above, for client-side components |

### Optional — Cron Job Security

| Variable | Used For | Description |
|----------|----------|-------------|
| `CRON_SECRET` | Securing cron/admin endpoints | Prevents unauthorized access to `/api/cron/*`, `/api/recompute`, `/api/revalidate` endpoints. Pass as `?secret=` query param or `Authorization: Bearer` header. |

### Optional — Zerodha Order Sync

Only needed if you want to auto-import orders from Zerodha Kite. Not required for core functionality.

| Variable | Used For | Description |
|----------|----------|-------------|
| `ZERODHA_USER_ID` | Kite login | Your Zerodha client ID |
| `ZERODHA_PASSWORD` | Kite login | Your Zerodha password |
| `ZERODHA_TOTP_SECRET` | Kite 2FA | TOTP secret for automated login |
| `ZERODHA_API_KEY` | Kite Connect API | API key from kite.trade |
| `ZERODHA_API_SECRET` | Kite Connect API | API secret from kite.trade |
| `GITHUB_PAT` | UI-triggered sync | GitHub Personal Access Token to trigger the Zerodha sync workflow from the Settings page |

---

## ❓ Known Limitations & Troubleshooting

### Troubleshooting Missing Tables
If you encounter an error like:
`relation "DailyPortfolioSnapshot" does not exist`

This means your Neon database hasn't been initialized with the Prisma schema. To fix this, run:
```bash
npm run db:setup
# or directly:
npx prisma db push
```

### Known Limitations
1. **Index History** — NIFTY500 MOMENTUM 50 historical data before Sep 30, 2024 requires CSV backfill
3. **Corporate Actions** — Must be manually entered (no API auto-detection for splits/bonuses)
4. **Real-time WebSocket** — May disconnect during market hours; auto-reconnect handles this
5. **AMFI Data** — PDF upload is manual; AMFI releases classification data twice per year

---

## 📱 Android App Setup

This project uses [Capacitor](https://capacitorjs.com/) to wrap the web app into a native Android application. 

### Prerequisites for Android
- [Android Studio](https://developer.android.com/studio) installed and configured
- Android SDK & Emulators setup in Android Studio

### Build & Run Android App

1. **Build the Web App**
   First, create a production build of the Next.js application:
   ```bash
   npm run build
   ```

2. **Sync and Open in Android Studio**
   Run the following command to sync the web assets to the Android project and automatically open Android Studio:
   ```bash
   npm run android:build
   ```
   *(This runs `npx cap sync android` followed by `npx cap open android`)*

3. **Run on Device / Emulator**
   Once Android Studio opens:
   - Wait for gradle to finish syncing
   - Select your target device or emulator from the toolbar
   - Click the **Play** button (Run 'app') to build and launch the app

> [!NOTE]
> The `.env.local` variables must be configured correctly before running `npm run build` so that the frontend has the correct API URLs and settings baked in for the mobile app.

---

## 🧑‍💻 Development

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run lint         # Run ESLint
npx prisma generate  # Regenerate Prisma client
npx prisma db push   # Push schema changes to database
npx prisma studio    # Open Prisma Studio (DB browser)
```

---

## 📄 License

Private - All rights reserved.
