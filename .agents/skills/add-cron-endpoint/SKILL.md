---
name: add-cron-endpoint
description: Scaffold a new cron job API endpoint for the Alpha Portfolio Tracker. Use when adding any scheduled background job (e.g. a new data sync, cleanup task, or report). Handles route creation, cron auth, README update, and cron-job.org config.
---

# Add Cron Endpoint

## Step 1 — Create the route file

Create `src/app/api/cron/<name>/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { logger } from '@/lib/logger';

const log = logger.scope('<Name>Cron');

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // seconds — increase if needed

export async function GET(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  try {
    // --- your logic here ---

    return NextResponse.json({ status: 'ok' });
  } catch (err) {
    log.error('Cron failed:', err);
    return NextResponse.json(
      { status: 'error', error: String(err) },
      { status: 500 }
    );
  }
}
```

## Step 2 — Test locally

```bash
# Start dev server
npm run dev

# Trigger manually (no secret needed in dev)
curl http://localhost:3000/api/cron/<name>

# Or with secret if CRON_SECRET is set in .env.local
curl "http://localhost:3000/api/cron/<name>?secret=$CRON_SECRET"
```

## Step 3 — Update README.md

Add a row to the cron jobs table in the "Deploy to Vercel → Set Up Cron Jobs" section:

```
| N | Your Job Title | `/api/cron/<name>` | `cron expression` | IST time | What it does |
```

## Step 4 — Configure on cron-job.org

- URL: `https://your-app.vercel.app/api/cron/<name>?secret=YOUR_CRON_SECRET`
- Schedule: your cron expression (UTC)
- Method: GET
- Time zone: UTC
- Notifications: on failure

## Auth pattern reference

`verifyCronSecret()` accepts the secret as:
- Query param: `?secret=YOUR_CRON_SECRET`
- Header: `Authorization: Bearer YOUR_CRON_SECRET`

Set `CRON_SECRET` in both `.env.local` and Vercel environment variables.
