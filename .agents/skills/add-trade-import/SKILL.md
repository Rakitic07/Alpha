---
name: add-trade-import
description: Add support for a new broker's trade export format in the Alpha Portfolio Tracker. Use when a user wants to import trades from a new broker Excel/CSV format. The import pipeline lives in src/lib/import-service.ts.
---

# Add Trade Import Format

## Architecture

All trade import logic lives in `src/lib/import-service.ts`.

The UI entry point is the Trades page (`src/app/trades/`), which accepts Excel/CSV uploads and calls the `ingestOrdersWithDeduplication()` server action.

## Expected normalized trade shape

```typescript
interface KiteOrder {
  orderId: string;          // Unique order ID for deduplication
  symbol: string;           // NSE trading symbol (e.g. "RELIANCE")
  transactionType: 'BUY' | 'SELL';
  quantity: number;         // Positive integer
  averagePrice: number;     // Price per share in ₹
  orderTimestamp: Date;     // Execution timestamp (IST)
}
```

## Steps to add a new format

### 1. Identify the format
Download a sample export from the broker. Check:
- File format: Excel (.xlsx) or CSV?
- Column names and order
- Date format (DD-MM-YYYY, YYYY-MM-DD, DD/MM/YYYY?)
- Symbol format (NSE symbol, ISIN, or exchange:symbol?)
- Does it include a unique order ID for deduplication?

### 2. Write a parser function

Add to `src/lib/import-service.ts`:

```typescript
function parseBrokerFormat(rows: any[][]): KiteOrder[] {
  return rows
    .slice(1) // skip header row
    .filter(row => row[COL_STATUS] === 'COMPLETE') // only executed orders
    .map(row => ({
      orderId: String(row[COL_ORDER_ID]),
      symbol: normalizeSymbol(String(row[COL_SYMBOL])),
      transactionType: row[COL_TYPE] === 'BUY' ? 'BUY' : 'SELL',
      quantity: Number(row[COL_QTY]),
      averagePrice: Number(row[COL_PRICE]),
      orderTimestamp: parseDate(String(row[COL_DATE])), // → Date in IST
    }))
    .filter(o => o.quantity > 0 && o.averagePrice > 0);
}
```

### 3. Symbol normalization

NSE symbols sometimes differ between brokers. Common fixes:
- Remove `-EQ` suffix: `RELIANCE-EQ` → `RELIANCE`
- Handle `NSE:SYMBOL` format: split on `:`
- Check `SymbolMapping` table for renamed symbols

```typescript
function normalizeSymbol(raw: string): string {
  return raw.replace(/-EQ$/, '').split(':').pop()!.trim().toUpperCase();
}
```

### 4. Wire into the existing pipeline

```typescript
// After parsing, pass to the standard deduplication pipeline:
const orders = parseBrokerFormat(rows);
const result = await ingestOrdersWithDeduplication(
  orders,
  `broker-import-${filename}`,
  onProgress
);
```

### 5. Test

```bash
# Start dev server
npm run dev
# Upload a sample file on the Trades page (/trades)
# Check the import result and verify transactions in Prisma Studio
npx prisma studio
```

## Date parsing helpers

```typescript
import { parse } from 'date-fns';

// DD-MM-YYYY
const d = parse(str, 'dd-MM-yyyy', new Date());

// YYYY-MM-DD
const d = parse(str, 'yyyy-MM-dd', new Date());

// DD/MM/YYYY HH:mm:ss
const d = parse(str, 'dd/MM/yyyy HH:mm:ss', new Date());
```

## Deduplication

`ingestOrdersWithDeduplication()` uses `orderId` as the dedup key (stored in `Transaction.orderId` with `@unique`). Importing the same file twice is safe.

If the broker doesn't provide order IDs, generate a deterministic one:
```typescript
const orderId = `${symbol}-${date.toISOString()}-${qty}-${price}`;
```
