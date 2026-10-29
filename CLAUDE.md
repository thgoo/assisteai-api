# CLAUDE.md

API of AssisteAí (Bun + Hono + PostgreSQL). The API design (doc 05) and the step checklist (doc 04) live in
`../assisteai-back/docs/rewrite/`; follow the "How we work" section of its `README.md`. The frontend changes the API
implies: `../assisteai-next/docs/new-api-migration.md`.
Code conventions: doc 02, "Code conventions".

- This codebase is self-contained: no compatibility layers or references to previous systems. Design from doc 05.
- The API tests (`test/api/`) are black-box: they never import from `src/`.
- `test/fixtures/dataset.ts` is the single source of test data (seed and test expectations).
- `bun run check`, `bun run test` and `bun run test:api` must pass before calling a step done; then commit and push.
