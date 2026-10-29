# assisteai-api

API of AssisteAí, a movie and series rating site: Bun + Hono, PostgreSQL (Drizzle). The API design is in
`../assisteai-back/docs/rewrite/05-api-design.md`, and the step checklist in `04-steps.md` next to it.

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

## Tests

```sh
bun run check                     # typecheck + lint
bun run test                      # unit tests (next to the code in src/)
bun run test:api:local            # starts the mock and the app, runs the black-box HTTP tests in test/api/, stops both
bun run test:api                  # the same tests against an app (and mock) you already have running
```

The API tests talk HTTP to `BASE_URL` (default `http://127.0.0.1:3000`) and never import from `src/`. Tests that write
reset the database to the dataset before and after they run (`RESET_DB_COMMAND`, default `bun run db:seed`).
External APIs (TMDb, Telegram) are served by `test/mock/server.ts` under `/<host>/` prefixes and stubbed per test
through its control endpoints (`MOCK_URL`).

CI (`.github/workflows/ci.yml`) runs all of the above against a Postgres service container.

## Production

Same host and setup as bargah: PM2 (`ecosystem.config.cjs`), Postgres in Docker (`deploy/postgres/`), nginx and
Cloudflare in front. Setup, updates (`scripts/deploy.sh`), backups (`scripts/pg-backup.sh`) and the cutover runbook:
[`docs/DEPLOY.md`](docs/DEPLOY.md).
