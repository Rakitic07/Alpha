---
name: schema-migration
description: Apply Prisma schema changes to the Turso (libSQL/SQLite) database in the Alpha Portfolio Tracker. Use when adding new models, columns, or indexes. Covers the correct workflow — do NOT use `prisma db push` in production.
---

# Schema Migration (Turso / libSQL)

> [!IMPORTANT]
> This project uses Turso (libSQL/SQLite). The standard `npx prisma db push` does NOT reliably apply migrations to the remote Turso database. Always use `scripts/apply-turso-schema.ts` for production.

## Workflow

### 1. Edit the schema

Modify `prisma/schema.prisma`. Remember SQLite constraints:
- No `jsonb` — use `String` and serialize with `JSON.stringify`/`JSON.parse`
- No `uuid_generate_v4()` — use `@default(cuid())` or `@default(autoincrement())`
- No partial indexes or complex check constraints
- Booleans stored as integers (Prisma handles this automatically)

### 2. Generate the migration SQL

```bash
npx prisma migrate dev --name describe_your_change
```

This creates a new folder under `prisma/migrations/` with a `migration.sql` file.

### 3. Apply to Turso

```bash
npx tsx scripts/apply-turso-schema.ts
```

This script:
- Reads `.env.local` for `DATABASE_URL` / `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`
- Iterates all migration folders in `prisma/migrations/` (sorted)
- Applies each `migration.sql` via `@libsql/client`
- Skips already-applied migrations gracefully (libSQL is idempotent for `CREATE TABLE IF NOT EXISTS`)

### 4. Regenerate Prisma client

```bash
npx prisma generate
```

### 5. Verify

```bash
npx prisma studio  # browse Turso tables in the GUI
```

## Adding a column to an existing table

SQLite does not support `ALTER TABLE ... DROP COLUMN` or changing column types. You can:
- Add new nullable columns freely: `ALTER TABLE X ADD COLUMN y TEXT;`
- To remove/rename a column: create a new table, copy data, drop old, rename new

Prisma's migration generator handles this automatically — just let it generate the SQL.

## JSON fields pattern

```prisma
// schema.prisma
model WeeklyPortfolioSnapshot {
  sectorAllocation String? // JSON: SectorAllocation[]
}
```

```typescript
// Reading
const raw = snapshot.sectorAllocation ?? '[]';
const sectors: SectorAllocation[] = JSON.parse(raw);

// Writing
await prisma.weeklyPortfolioSnapshot.update({
  where: { id: snapshot.id },
  data: { sectorAllocation: JSON.stringify(sectors) },
});
```
