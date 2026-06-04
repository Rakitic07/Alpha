/**
 * compare-snapshots.mjs
 *
 * Compares the DailyPortfolioSnapshot table between:
 *   BEFORE → the backup SQL file  (pre-recalculation)
 *   AFTER  → the live Neon DB     (post-recalculation)
 *
 * Checks:
 *   ✅ Weekend snapshots are gone
 *   ✅ Special trading days (e.g. Budget Day Feb 1 2026) are preserved
 *   ✅ Every pre-existing weekday snapshot still exists after
 *   ✅ P/L values for unchanged weekday snapshots match within tolerance
 *   ✅ Weekly + Monthly snapshot counts look correct
 *   ⚠️  Flags any unexpected regressions
 *
 * Usage:
 *   node scripts/compare-snapshots.mjs backups/backup_2026-06-04T04-17-31.sql
 */

import { Client } from 'pg';
import { readFileSync, existsSync } from 'fs';

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('❌ Error: DATABASE_URL environment variable is not set.');
  process.exit(1);
}

const backupFile = process.argv[2];
if (!backupFile || !existsSync(backupFile)) {
  console.error('Usage: node scripts/compare-snapshots.mjs <backup-file.sql>');
  process.exit(1);
}

// ─── Tolerance for floating-point comparisons ───────────────────────────────
// ─── Tolerance for floating-point comparisons ───────────────────────────────
const TOLERANCE = 10.00; // ₹10.00 tolerance for minor post-market price adjustments

// ─── Known special trading sessions that MUST remain after recalc ───────────
// Add more here if you have other special sessions in your history
const KNOWN_SPECIAL_SESSIONS = [
  '2026-02-01', // Budget Day (Sunday)
];

// ─── Known trading holidays that were present in buggy DB but are now skipped 
const KNOWN_HOLIDAYS = [
  '2026-01-15', // Municipal Corporation Election
  '2026-01-26', // Republic Day
  '2026-03-03', // Holi
  '2026-04-03', // Good Friday
];

const DAY = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const isWeekend = (dateStr) => {
  const d = new Date(dateStr + 'T12:00:00Z');
  const dow = d.getUTCDay();
  return dow === 0 || dow === 6;
};
const dayName = (dateStr) => {
  const d = new Date(dateStr + 'T12:00:00Z');
  return DAY[d.getUTCDay()];
};

// ─── Parse backup SQL → extract DailyPortfolioSnapshot rows ─────────────────
function parseBackupSnapshots(sql) {
  const lines = sql.split('\n');
  const rows  = [];
  let columns = null;
  let inDailyBlock = false;
  let inValues = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect start of the DailyPortfolioSnapshot section
    if (line.includes('-- ── DailyPortfolioSnapshot')) { inDailyBlock = true; continue; }
    // Detect end of section (next table block starts)
    if (inDailyBlock && line.startsWith('-- ── ') && !line.includes('DailyPortfolioSnapshot')) break;
    if (!inDailyBlock) continue;

    // Parse column list from INSERT line
    if (line.startsWith('INSERT INTO "DailyPortfolioSnapshot"')) {
      const colMatch = line.match(/\(([^)]+)\)/);
      if (colMatch) columns = colMatch[1].split(',').map(c => c.trim().replace(/"/g, ''));
      inValues = false;
      continue;
    }

    if (line.trim() === 'VALUES') { inValues = true; continue; }
    if (line.trim() === 'ON CONFLICT DO NOTHING;') { inValues = false; continue; }

    // Parse a VALUES row — each is indented with 2 spaces and looks like:
    //   (val1, val2, ...),   or   (val1, val2, ...)
    if (inValues && columns && line.trim().startsWith('(')) {
      // Strip leading/trailing whitespace, trailing comma, and outer parens
      let rowStr = line.trim();
      if (rowStr.endsWith(',')) rowStr = rowStr.slice(0, -1);
      if (rowStr.startsWith('(')) rowStr = rowStr.slice(1);
      if (rowStr.endsWith(')')) rowStr = rowStr.slice(0, -1);

      // Split by ', ' — values are separated by ', ' (note the space after comma)
      // This works because our backup script uses:  join(', ')
      const rawVals = rowStr.split(', ');

      const obj = {};
      columns.forEach((col, idx) => {
        let val = rawVals[idx]?.trim();
        if (val === undefined || val === 'NULL') { obj[col] = null; return; }
        if (val === 'TRUE')  { obj[col] = true;  return; }
        if (val === 'FALSE') { obj[col] = false; return; }
        if (val.startsWith("'") && val.endsWith("'")) {
          val = val.slice(1, -1).replace(/''/g, "'");
        }
        const n = Number(val);
        obj[col] = isNaN(n) || val === '' ? val : n;
      });
      rows.push(obj);
    }
  }

  if (!columns) throw new Error('Could not find DailyPortfolioSnapshot INSERT in backup');
  return { columns, rows };
}


// ─── Format helpers ──────────────────────────────────────────────────────────
const fmt = (n) => n == null ? 'NULL' : Number(n).toFixed(2);
const pct = (n) => n == null ? 'NULL' : (Number(n) * 100).toFixed(4) + '%';
const pass = (msg) => `  ✅ ${msg}`;
const fail = (msg) => `  ❌ ${msg}`;
const warn = (msg) => `  ⚠️  ${msg}`;
const info = (msg) => `  ℹ️  ${msg}`;

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  SNAPSHOT COMPARISON: Before vs After Recalculation');
  console.log('══════════════════════════════════════════════════════\n');

  // ── Load BEFORE from backup ──────────────────────────────────────────────
  console.log(`📂 Loading backup: ${backupFile}`);
  const sql = readFileSync(backupFile, 'utf8');
  const { rows: beforeRows } = parseBackupSnapshots(sql);
  console.log(`   Parsed ${beforeRows.length} DailyPortfolioSnapshot rows from backup\n`);

  const beforeByDate = new Map(beforeRows.map(r => {
    // Dates in backup are UTC ISO strings like '2024-08-11T18:30:00.000Z'
    // which is midnight IST (UTC+5:30). Must apply the +5:30 offset to get
    // the correct IST date that the live DB returns via to_char(date,'YYYY-MM-DD').
    const rawDate = String(r['date']);
    let d;
    if (rawDate.includes('T')) {
      const utc = new Date(rawDate);
      const ist = new Date(utc.getTime() + 5.5 * 60 * 60 * 1000);
      d = ist.toISOString().slice(0, 10);
    } else {
      d = rawDate.slice(0, 10);
    }
    r._parsedDate = d; // Mutate original so beforeRows.filter() can access it
    return [d, r];
  }));

  // ── Load AFTER from live DB ──────────────────────────────────────────────
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  console.log('🌐 Connected to live Neon DB');

  const afterRes = await client.query(`
    SELECT
      to_char(date, 'YYYY-MM-DD') as date,
      "totalEquity", "investedCapital", "portfolioNAV",
      "niftyNAV", "dailyPnL", "dailyReturn", "drawdown", "navMA200",
      "cashflow", "units"
    FROM "DailyPortfolioSnapshot"
    ORDER BY date ASC
  `);
  const afterRows = afterRes.rows;
  const afterByDate = new Map(afterRows.map(r => [r.date, r]));
  console.log(`   Found ${afterRows.length} DailyPortfolioSnapshot rows in live DB\n`);

  // ── Also grab weekly + monthly counts ────────────────────────────────────
  const weeklyBefore = (sql.match(/-- ── WeeklyPortfolioSnapshot \((\d+) rows\)/) || [])[1];
  const monthlyBefore = (sql.match(/-- ── MonthlyPortfolioSnapshot \((\d+) rows\)/) || [])[1];
  const weeklyAfterRes = await client.query('SELECT COUNT(*)::int as n FROM "WeeklyPortfolioSnapshot"');
  const monthlyAfterRes = await client.query('SELECT COUNT(*)::int as n FROM "MonthlyPortfolioSnapshot"');

  const results = { passed: 0, failed: 0, warnings: 0 };
  const log = (line) => console.log(line);
  const check = (ok, passMsg, failMsg) => {
    if (ok) { log(pass(passMsg)); results.passed++; }
    else     { log(fail(failMsg)); results.failed++; }
  };
  const warnIf = (cond, msg) => { if (cond) { log(warn(msg)); results.warnings++; } };

  // ════════════════════════════════════════════════════════════════════════
  // CHECK 1: Weekend snapshots must be gone (except confirmed special days)
  // ════════════════════════════════════════════════════════════════════════
  log('── CHECK 1: Weekend snapshots removed ────────────────────────────');
  const afterWeekend = afterRows.filter(r => isWeekend(r.date) && !KNOWN_SPECIAL_SESSIONS.includes(r.date));
  const beforeWeekendCount = beforeRows.filter(r => isWeekend(r._parsedDate) && !KNOWN_SPECIAL_SESSIONS.includes(r._parsedDate)).length;
  check(
    afterWeekend.length === 0,
    `No phantom weekend snapshots in DB (was ${beforeWeekendCount} before)`,
    `${afterWeekend.length} phantom weekend snapshot(s) still in DB!`
  );
  if (afterWeekend.length > 0) {
    afterWeekend.forEach(r => log(`     → ${r.date} (${dayName(r.date)})  pnl=₹${fmt(r.dailyPnL)}`));
  }

  // COUNT: before vs after weekend
  log(info(`Weekend snapshots: ${beforeWeekendCount} BEFORE → ${afterWeekend.length} AFTER (removed ${beforeWeekendCount - afterWeekend.length})`));
  log('');

  // ════════════════════════════════════════════════════════════════════════
  // CHECK 2: Special trading sessions must still exist
  // ════════════════════════════════════════════════════════════════════════
  log('── CHECK 2: Special trading sessions preserved ────────────────────');
  for (const specialDate of KNOWN_SPECIAL_SESSIONS) {
    const afterEntry = afterByDate.get(specialDate);
    const beforeEntry = beforeByDate.get(specialDate);
    check(
      !!afterEntry,
      `${specialDate} (${dayName(specialDate)}) still present as special session`,
      `${specialDate} (${dayName(specialDate)}) is MISSING — special session was wrongly removed!`
    );
    if (afterEntry && beforeEntry) {
      warnIf(
        Math.abs(Number(afterEntry.dailyPnL) - Number(beforeEntry['dailyPnL'])) > TOLERANCE,
        `${specialDate} P/L changed: before=₹${fmt(beforeEntry['dailyPnL'])} after=₹${fmt(afterEntry.dailyPnL)}`
      );
    }
  }
  log('');

  // ════════════════════════════════════════════════════════════════════════
  // CHECK 3: Total snapshot count
  // ════════════════════════════════════════════════════════════════════════
  log('── CHECK 3: Snapshot counts ───────────────────────────────────────');
  const expectedAfterCount = beforeRows.length - beforeWeekendCount;
  const actualAfterCount = afterRows.length;
  log(info(`Before: ${beforeRows.length}  |  Expected after: ~${expectedAfterCount}  |  Actual after: ${actualAfterCount}`));
  check(
    actualAfterCount <= beforeRows.length,
    `After count (${actualAfterCount}) ≤ before count (${beforeRows.length}) — no extra rows introduced`,
    `After count (${actualAfterCount}) > before count (${beforeRows.length}) — unexpected extra rows!`
  );
  check(
    actualAfterCount >= expectedAfterCount - 5 && actualAfterCount <= expectedAfterCount + 5,
    `After count (${actualAfterCount}) within ±5 of expected (${expectedAfterCount})`,
    `After count (${actualAfterCount}) deviates more than 5 from expected (${expectedAfterCount})`
  );

  // Weekly + Monthly
  const weeklyAfter = weeklyAfterRes.rows[0].n;
  const monthlyAfter = monthlyAfterRes.rows[0].n;
  log(info(`Weekly  snapshots: ${weeklyBefore ?? '?'} BEFORE → ${weeklyAfter} AFTER`));
  log(info(`Monthly snapshots: ${monthlyBefore ?? '?'} BEFORE → ${monthlyAfter} AFTER`));
  log('');

  // ════════════════════════════════════════════════════════════════════════
  // CHECK 4: All weekday snapshots from before are still present after
  // ════════════════════════════════════════════════════════════════════════
  log('── CHECK 4: All weekday snapshots preserved ───────────────────────');
  const beforeWeekdays = beforeRows.filter(r => {
    const dStr = r._parsedDate || String(r['date']).slice(0,10);
    if (KNOWN_HOLIDAYS.includes(dStr)) return false;
    return !isWeekend(dStr) || KNOWN_SPECIAL_SESSIONS.includes(dStr);
  });
  const missingAfter = beforeWeekdays.filter(r => !afterByDate.has(r._parsedDate || String(r['date']).slice(0,10)));
  check(
    missingAfter.length === 0,
    `All ${beforeWeekdays.length} weekday snapshots are present after recalculation`,
    `${missingAfter.length} weekday snapshot(s) are MISSING after recalculation!`
  );
  if (missingAfter.length > 0 && missingAfter.length <= 10) {
    missingAfter.forEach(r => log(`     → ${r._parsedDate} (${dayName(r._parsedDate)})`));
  }
  log('');

  // ════════════════════════════════════════════════════════════════════════
  // CHECK 5: P/L values for weekday snapshots match (within tolerance)
  // ════════════════════════════════════════════════════════════════════════
  log('── CHECK 5: P/L integrity for weekday snapshots ──────────────────');
  let pnlMismatches = [];
  let navMismatches = [];
  let equityMismatches = [];

  for (const bRow of beforeWeekdays) {
    const dateStr = bRow._parsedDate || String(bRow['date']).slice(0, 10);
    const aRow = afterByDate.get(dateStr);
    if (!aRow) continue;

    const bPnL    = Number(bRow['dailyPnL'] ?? 0);
    const aPnL    = Number(aRow.dailyPnL ?? 0);
    const bNAV    = Number(bRow['portfolioNAV'] ?? 0);
    const aNAV    = Number(aRow.portfolioNAV ?? 0);
    const bEquity = Number(bRow['totalEquity'] ?? 0);
    const aEquity = Number(aRow.totalEquity ?? 0);

    if (Math.abs(aPnL - bPnL) > TOLERANCE)
      pnlMismatches.push({ date: dateStr, before: bPnL, after: aPnL, diff: aPnL - bPnL });
    if (Math.abs(aNAV - bNAV) > 0.01)
      navMismatches.push({ date: dateStr, before: bNAV, after: aNAV, diff: aNAV - bNAV });
    if (Math.abs(aEquity - bEquity) > TOLERANCE)
      equityMismatches.push({ date: dateStr, before: bEquity, after: aEquity, diff: aEquity - bEquity });
  }

  check(
    pnlMismatches.length === 0,
    `All weekday dailyPnL values match within ₹${TOLERANCE} tolerance`,
    `${pnlMismatches.length} weekday dailyPnL value(s) changed!`
  );
  if (pnlMismatches.length > 0) {
    log(`     Showing up to 10 mismatches (sorted by absolute diff):`);
    pnlMismatches.sort((a,b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 10).forEach(m => {
      log(`     → ${m.date} (${dayName(m.date)})  before=₹${m.before.toFixed(2)}  after=₹${m.after.toFixed(2)}  diff=₹${m.diff.toFixed(2)}`);
    });
  }

  check(
    navMismatches.length === 0,
    `All weekday portfolioNAV values match within 0.01 tolerance`,
    `${navMismatches.length} weekday portfolioNAV value(s) changed!`
  );
  if (navMismatches.length > 0 && navMismatches.length <= 10) {
    navMismatches.slice(0, 10).forEach(m => {
      log(`     → ${m.date}  before=${m.before.toFixed(4)}  after=${m.after.toFixed(4)}  diff=${m.diff.toFixed(4)}`);
    });
  }

  check(
    equityMismatches.length === 0,
    `All weekday totalEquity values match within ₹${TOLERANCE} tolerance`,
    `${equityMismatches.length} weekday totalEquity value(s) changed!`
  );
  log('');

  // ════════════════════════════════════════════════════════════════════════
  // CHECK 6: Latest snapshot sanity (most recent weekday)
  // ════════════════════════════════════════════════════════════════════════
  log('── CHECK 6: Latest snapshot sanity ───────────────────────────────');
  const latestAfter = afterRows[afterRows.length - 1];
  if (latestAfter) {
    log(info(`Latest snapshot date  : ${latestAfter.date} (${dayName(latestAfter.date)})`));
    log(info(`Latest totalEquity    : ₹${fmt(latestAfter.totalEquity)}`));
    log(info(`Latest portfolioNAV   : ${fmt(latestAfter.portfolioNAV)}`));
    log(info(`Latest dailyPnL       : ₹${fmt(latestAfter.dailyPnL)}`));
    log(info(`Latest dailyReturn    : ${pct(latestAfter.dailyReturn)}`));
    check(
      !isWeekend(latestAfter.date) || KNOWN_SPECIAL_SESSIONS.includes(latestAfter.date),
      `Latest snapshot is on a weekday (${dayName(latestAfter.date)})`,
      `Latest snapshot is on a WEEKEND (${dayName(latestAfter.date)}) — something went wrong!`
    );
    check(
      Number(latestAfter.totalEquity) > 0,
      `Latest totalEquity is positive (₹${fmt(latestAfter.totalEquity)})`,
      `Latest totalEquity is zero or negative!`
    );
  }
  log('');

  // ════════════════════════════════════════════════════════════════════════
  // CHECK 7: Sample comparison — last 10 rows side by side
  // ════════════════════════════════════════════════════════════════════════
  log('── CHECK 7: Side-by-side comparison (last 10 trading days) ──────');
  const last10After = afterRows.slice(-10);

  log('  Date       | Day | BEFORE dailyPnL | AFTER dailyPnL  | Match?');
  log('  ──────────────────────────────────────────────────────────────');
  for (const aRow of last10After) {
    const bRow = beforeByDate.get(aRow.date);
    const bPnL = bRow ? Number(bRow['dailyPnL'] ?? 0) : null;
    const aPnL = Number(aRow.dailyPnL ?? 0);
    const match = bPnL === null ? '(new)' : Math.abs(aPnL - bPnL) < TOLERANCE ? '✅' : '❌';
    const bStr  = bPnL === null ? '      N/A      ' : `₹${String(bPnL.toFixed(2)).padStart(13)}`;
    log(`  ${aRow.date} | ${dayName(aRow.date).padEnd(3)} | ${bStr} | ₹${String(aPnL.toFixed(2)).padStart(13)} | ${match}`);
  }
  log('');

  // ════════════════════════════════════════════════════════════════════════
  // FINAL SUMMARY
  // ════════════════════════════════════════════════════════════════════════
  log('══════════════════════════════════════════════════════');
  log('  FINAL SUMMARY');
  log('══════════════════════════════════════════════════════');
  log(`  ✅ Passed  : ${results.passed}`);
  log(`  ❌ Failed  : ${results.failed}`);
  log(`  ⚠️  Warnings: ${results.warnings}`);
  log('');
  if (results.failed === 0 && results.warnings === 0) {
    log('  🎉 ALL CHECKS PASSED — recalculation looks clean!');
  } else if (results.failed === 0) {
    log('  ✅ No failures, but review warnings above.');
  } else {
    log('  ❌ Some checks FAILED — review above before proceeding.');
    log(`     To restore: node scripts/restore-db.mjs ${backupFile} --clean`);
  }
  log('══════════════════════════════════════════════════════\n');

  await client.end();
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('❌ Comparison failed:', e.message); process.exit(1); });
