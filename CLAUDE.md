# CLAUDE.md

Bun + Hono rewrite of the legacy AssisteAí API. The plan, the decisions and the step checklist live in
`../assisteai-back/docs/rewrite/`. Read its `README.md` first and follow its "How we work" section.
Code conventions: doc 02, "Code conventions".

- The contract suite (`test/contract/`) is black-box: it never imports from `src/`. It must stay green against the
  legacy env (`bun run legacy:up`) with `TARGET=legacy`, and against the new app with `TARGET=new`.
- `test/fixtures/dataset.ts` is the single source of test data for both databases.
- `bun run check` (typecheck + lint) must pass before calling a step done.
