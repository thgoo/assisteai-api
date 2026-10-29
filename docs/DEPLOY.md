# Deploying

Production runs on the same EC2 (Amazon Linux 2023, `ec2-user`) as the frontend and bargah, the way bargah runs:
the API under PM2 with Bun, Postgres in Docker bound to `127.0.0.1`, nginx in front, Cloudflare in front of nginx.

| | |
|---|---|
| Code | `/var/www/assisteai-api` (this repo, `main`). Next to it: the front in `/var/www/assisteai.com.br`, the old API in `/var/www/api.assisteai.com.br` (removed after the cutover) |
| Process | PM2 `api.assisteai.com.br` (`ecosystem.config.cjs`), logs in `~/.pm2/logs/` |
| Port | `3007` on `127.0.0.1` (taken on the host: 3002–3006 by other sites, 3306 MariaDB, 5432 bargah's Postgres) |
| Database | `deploy/postgres` (Docker), `127.0.0.1:5433` |
| Backups | `scripts/pg-backup.sh`, daily cron → `/var/backups/assisteai` |

## First-time setup

Bun 1.3.14, PM2, Docker and Docker Compose are already on the host (bargah uses them).

```sh
sudo mkdir /var/www/assisteai-api && sudo chown ec2-user: /var/www/assisteai-api
git clone https://github.com/thgoo/assisteai-api.git /var/www/assisteai-api && cd /var/www/assisteai-api
bun install --frozen-lockfile

# Postgres
(cd deploy/postgres && cp .env.example .env \
  && sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 24)/" .env && docker compose up -d)
```

`.env` (production values; never committed):

```sh
NODE_ENV=production
PORT=3007
CORS_ORIGINS=https://assisteai.com.br,https://www.assisteai.com.br,https://beta2.assisteai.com.br
DATABASE_URL=postgres://assisteai:<POSTGRES_PASSWORD from deploy/postgres/.env>@127.0.0.1:5433/assisteai
GOOGLE_CLIENT_ID=736877274011-im98og8tkedl1gdtvjrj6u217dpqf9rq.apps.googleusercontent.com
SESSION_COOKIE_DOMAIN=.assisteai.com.br
TMDB_API_TOKEN=<API read access token>
FRONTEND_URL=https://assisteai.com.br
TELEGRAM_BOT_TOKEN=<the channel's bot token>
TELEGRAM_CHAT_ID=<the channel's chat id>
```

Leave out `HOST`, `RATE_LIMIT_PER_MINUTE`, `GOOGLE_JWKS_URL`, `TMDB_API_URL`, `TELEGRAM_API_URL`: the defaults are the
production values.

```sh
bun run db:migrate
pm2 start ecosystem.config.cjs && pm2 save
curl -s "127.0.0.1:$(grep ^PORT= .env | cut -d= -f2)/health"     # {"status":"ok"}

# Backups
sudo mkdir -p /var/backups/assisteai && sudo chown ec2-user /var/backups/assisteai
scripts/pg-backup.sh                                              # once by hand
crontab -e   # 30 4 * * * /var/www/assisteai-api/scripts/pg-backup.sh >> /home/ec2-user/assisteai-backup.log 2>&1
```

### nginx

A server block per hostname, with the TLS setup copied from the current `api.assisteai.com.br` vhost. Until the
cutover, use a temporary hostname (e.g. `api-next.assisteai.com.br`, proxied in Cloudflare):

```nginx
location / {
    proxy_pass http://127.0.0.1:3007;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;   # the client (Cloudflare also sends CF-Connecting-IP)
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## Updates

```sh
cd /var/www/assisteai-api && scripts/deploy.sh
```

Pulls, installs, migrates, restarts and waits for `/health`. Migrations only ever add, so the running process keeps
working while they apply. Rollback: `git checkout <previous commit>`, `bun install --frozen-lockfile`,
`pm2 restart api.assisteai.com.br` (a migration that already ran stays; it's additive).

## Cutover (S25)

Front and API switch together: the new front only speaks to the new API. Rehearse the data part the day before with
the same commands (steps 3–4), on a fresh copy of the target database, and note how long it takes.

1. **Before**: the new API runs on the temporary hostname with an empty, migrated database; the new front build is
   ready to deploy; the one-off migration (`~/projects/assisteai-data/migration`) is copied to the server and
   `bun install`ed there.
2. **Freeze legacy writes** (no PHP change): in the current `api.assisteai.com.br` nginx vhost, answer `503` to anything
   but `GET`/`OPTIONS`, then `sudo nginx -s reload`:
   ```nginx
   if ($request_method !~ ^(GET|OPTIONS)$) { return 503; }
   ```
3. **Migrate** straight from the production MariaDB (read-only use) into the new Postgres, and archive a dump:
   ```sh
   mysqldump --single-transaction --routines assisteai | gzip > ~/assisteai-final-$(date -u +%F).sql.gz
   export SOURCE_URL=mysql://<user>:<password>@127.0.0.1:3306/assisteai
   export TARGET_URL=postgres://assisteai:<password>@127.0.0.1:5433/assisteai
   bun migrate.ts       # the target is on 127.0.0.1, so no --allow-remote-target
   bun validate.ts      # must end with "Source and target match row by row."
   ```
   **Go / no-go**: anything but a clean validation → unfreeze (undo step 2) and investigate.
4. **Restart the API** on the migrated data: `pm2 restart api.assisteai.com.br`, then through the temporary hostname:
   `/health`, `/movies`, a few `/movies/:id`.
5. **Switch**: point the `api.assisteai.com.br` vhost at the new API (the `location /` block above, replacing the PHP
   handler), `sudo nginx -s reload`; deploy the new front build.
6. **Smoke test** on the production hostnames: home (random movie), infinite list, a movie page, sign in with Google
   (an existing account lands on its own ratings), rate a title (the Telegram message shows up), sign out.
7. **Rollback** (only if step 6 fails): restore the old vhost and the old front build, remove the freeze. Legacy data
   is untouched, but anything written on the new stack in between is lost, so decide quickly.
8. After two quiet weeks: decommission the legacy app (S26) and keep the final dump.
