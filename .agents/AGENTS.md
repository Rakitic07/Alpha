# Alpha Portfolio Tracker — Agent Rules

## Project identity
Self-hosted Indian equity portfolio tracker. Next.js 16 App Router · Turso (libSQL/SQLite) · Prisma 7 · Upstox API.

## Before writing any code
- Read `CLAUDE.md` for the full project memory including architecture, key files, and conventions.
- Use `search_graph` or `get_code_snippet` from codebase-memory-mcp before grepping — the knowledge graph is indexed.

## Hard rules
1. All DB access via `import { prisma } from '@/lib/db'` — never raw libsql client in `src/`.
2. Secrets and DB calls only in Server Actions or API routes — never client components.
3. Run `npm run lint` before finishing any code task.
4. Debug against Turso (production DB). `prisma/dev.db` is dummy data.
5. Never use Postgres-specific SQL. This project uses SQLite/libSQL.
6. SQLite IN clause limit: 500. Use `chunkArray()` from `@/lib/db`.
7. Market dates in IST — use `src/lib/tz.ts` helpers.

## Skills available
- `add-trade-import` — adding new trade import formats
- `add-cron-endpoint` — scaffolding a new cron job
- `schema-migration` — Prisma schema changes for Turso
- `screener-scoring` — modifying the momentum screener formula
