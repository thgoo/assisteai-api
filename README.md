# assisteai-api

Bun + Hono rewrite of the legacy AssisteAí Lumen API (`../assisteai-back`), backed by PostgreSQL.
The plan and the step checklist live in `../assisteai-back/docs/rewrite/` (start with its `README.md`).

## Running

```sh
bun install
cp .env.example .env              # Bun loads .env automatically
bun run db:up                     # Postgres 18 on 127.0.0.1:55432 (compose.yaml)
bun run db:migrate                # apply drizzle/ migrations
bun run db:seed                   # replace the data with test/fixtures/dataset.ts (local databases only)
bun run dev                       # http://127.0.0.1:3000, restarts on change
```

Schema changes: edit `src/db/schema/`, then `bun run db:generate` and commit the new migration. CI fails when the
schema and `drizzle/` disagree.

## Contract suite

Black-box HTTP tests in `test/contract/`, written once and run against both implementations. They describe what the
Next.js frontend relies on; deliberate deviations of the new app are encoded per test with `byTarget()`.

```sh
bun install
bun run legacy:up                 # legacy PHP + MariaDB (seeded with test/fixtures/dataset.ts) + external API mock
bun run test:contract             # TARGET=legacy, BASE_URL=http://127.0.0.1:8000 by default
TARGET=new BASE_URL=http://127.0.0.1:3000 RESET_DB_COMMAND='bun run db:seed' bun run test:contract
bun run legacy:down               # also drops the database
```

Tests that write (login, refresh, ratings) reset the database to the dataset before and after they run, through
`RESET_DB_COMMAND` (default: `sh test/legacy-env/reset-db.sh`), so the suite can be rerun at will. External APIs
(Google, TMDb, Telegram) are stubbed per test through the mock's control port (`MOCK_URL`).

The legacy env expects the PHP repo at `../assisteai-back` (override with `LEGACY_APP_DIR`). To explore production
data instead of the fixtures: `bun run legacy:down && DUMP=/path/to/dump.sql.gz bun run legacy:up`.
Dumps contain personal data: keep them outside the repo (or in `.data/`, which is gitignored).

## Checks

```sh
bun run check                     # typecheck + lint
bun run test                      # unit tests (next to the code in src/)
```

CI (`.github/workflows/ci.yml`) runs both, then the contract files of the endpoints implemented so far against the new
app.
