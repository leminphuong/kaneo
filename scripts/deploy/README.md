# Deploying this fork to an Ubuntu server

This fork carries changes that are not in `ghcr.io/usekaneo/kaneo` (Vietnamese
default locale, Telegram-only project integrations, the UTC timestamp fix), so
the image has to be **built from this source**. `compose.build.yml` overlays
`compose.yml` to do that; `scripts/deploy/deploy.sh` wraps the whole thing.

## Requirements

- Ubuntu 22.04 or 24.04
- **4 GB of RAM or swap** for the build. The Vite build is the memory-hungry
  part; on a 1–2 GB VPS it is OOM-killed and Docker reports `exit code 137`.
  The deploy script checks this and tells you how to add swap.
- 10 GB of free disk
- Ports: 5173 for the app, or 80/443 if you put a reverse proxy in front

Docker is installed by the script if it is missing.

## 0. Push this fork to your own GitHub repo

There is no git repository in this working tree, and you cannot push to
`usekaneo/kaneo`. Create an **empty** repo under your own account (no README,
no .gitignore — this tree already has both), then:

```bash
bash scripts/deploy/push-to-github.sh git@github.com:you/kaneo.git
```

It initialises git, sets your identity if unset, commits, and pushes. Re-run it
any time to push later changes; the remote URL is remembered.

Before committing it checks that nothing carrying a live secret is staged and
aborts if it finds one. `.env` holds the database password, `AUTH_SECRET` and
the R2 keys, and is already in `.gitignore` — keep it that way.

### Silence the upstream workflows

This tree carries 20 workflows belonging to `usekaneo`: they publish to that
org's registries and need secrets your fork does not have, so every push emails
you a wall of failures. Keep only the fork's own workflow:

```bash
mkdir -p .github/workflows-disabled
git mv .github/workflows/{auto-assign,auto-merge,build-images,code-review,deploy-site,docker,helm-chart,issue-notify,nightly,pr-size-labeler,pr-title,publish-mcp,publish-planka-import,release,release-notify,ui-review,ui-review-run,update-contributors}.yml .github/workflows-disabled/
```

`ci.yml` and `helm-validate.yml` are safe to keep; `fork-deploy.yml` already
runs typecheck, tests and the locale check, so dropping `ci.yml` too is fine.

### Deploy automatically on push

`.github/workflows/fork-deploy.yml` typechecks and tests every push, then
deploys if — and only if — the three SSH secrets are present. Nothing else has
to be switched on: with the secrets missing, the deploy job still runs and its
summary names what it needs, so an unconfigured deployment is visible instead
of looking like a deploy that ran and changed nothing.

Under **Settings → Secrets and variables → Actions**:

| Kind | Name | Value |
| --- | --- | --- |
| Variable | `DEPLOY_PATH` | server path, default `/opt/kaneo` |
| Secret | `DEPLOY_HOST` | server IP or hostname |
| Secret | `DEPLOY_USER` | SSH user |
| Secret | `DEPLOY_SSH_KEY` | **private** key, full PEM including the BEGIN/END lines |
| Secret | `DEPLOY_PORT` | optional, default `22` |
| Secret | `DEPLOY_KNOWN_HOSTS` | optional but recommended: `ssh-keyscan <host>` output |
| Secret | `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | optional: turn uploads on, see [section 4](#4-uploads-on-cloudflare-r2) |

Generate a key pair used only for deployment, and give the public half to the
server:

```bash
ssh-keygen -t ed25519 -C "kaneo-deploy" -f ~/.ssh/kaneo_deploy -N ""
```

```bash
ssh-copy-id -i ~/.ssh/kaneo_deploy.pub user@SERVER_IP
```

Paste the contents of `~/.ssh/kaneo_deploy` (no `.pub`) into `DEPLOY_SSH_KEY`.

Without `DEPLOY_KNOWN_HOSTS` the workflow trusts the host key on first contact,
which a network attacker can exploit; pin it with
`ssh-keyscan <host>` once and paste the output.

The deploy step runs `git merge --ff-only` on the server, so the server must be
a **git clone** of your repo (not an rsync copy) and must have no local commits.

### A private repo needs no credentials on the server

The workflow fetches using the job's own `GITHUB_TOKEN`, which is scoped to this
repository and expires when the job ends, so the server is never given a
standing credential for GitHub. It fetches from an explicit URL rather than from
whatever `origin` points at, so the clone's remote can stay as it is.

What this does *not* fix is a **manual** `git pull` while you are SSHed in: on a
private repo that still fails with `could not read Username for
'https://github.com'`, because your server has no GitHub credentials of its own.
The automated deploy is unaffected. If you want manual pulls to work too, give
the server a read-only deploy key:

```bash
ssh-keygen -t ed25519 -C "kaneo-server" -f ~/.ssh/github_kaneo -N ""
cat ~/.ssh/github_kaneo.pub
```

Add that public key under your repo's **Settings → Deploy keys → Add deploy
key** (leave write access off), then point the clone and SSH at it:

```bash
printf 'Host github.com\n  IdentityFile ~/.ssh/github_kaneo\n  IdentitiesOnly yes\n' >> ~/.ssh/config
git -C /opt/kaneo remote set-url origin git@github.com:YOUR_USER/kaneo.git
ssh -T git@github.com   # accept the host key once, so later pulls are not prompted
```

## 1. Get the code onto the server

Push this branch to your own Git remote, then on the server:

```bash
git clone <your-fork-url> kaneo
cd kaneo
git checkout <your-branch>
```

If you are not using a remote, copy the working tree up instead. Exclude
`node_modules` and `.env` — `.env` holds your local development secrets and the
server generates its own:

```bash
rsync -az --delete \
  --exclude node_modules --exclude .git --exclude .env --exclude dist \
  ./ user@server:/opt/kaneo/
```

## 2. Deploy

```bash
bash scripts/deploy/deploy.sh
```

It asks for the public URL, writes a `.env` with a generated `AUTH_SECRET` and
database password, builds the image, starts Postgres and Kaneo, and waits for
the health check. The first build takes several minutes; later runs reuse the
Docker layer cache.

Re-run the same command after `git pull` to update. It never overwrites an
existing `.env`, so secrets and data survive.

The image is built from the commit that is checked out (`git archive HEAD`),
never from the files on disk, and the script stops when the checkout differs
from git: an edited or added file on the server is how an injected script once
reached production. Once the containers are healthy it runs
`scripts/deploy/verify-web-integrity.sh`, which compares what the running
container serves with what its image renders and with what the public URL
returns. If either step stops the deploy, read [RECOVERY.md](./RECOVERY.md)
before deleting anything.

Knobs, all optional: `KANEO_BUILD_NO_CACHE=1` rebuilds every layer,
`KANEO_ALLOW_DIRTY_TREE=1` continues past a modified checkout (the build still
ignores the modifications), `KANEO_SKIP_PUBLIC_CHECK=1` skips the public-URL
comparison when a proxy legitimately rewrites responses.

## 3a. Adding this as a second site on an aaPanel VPS

If the server already runs another site through aaPanel's nginx (for example a
Django app on port 8000), use this instead of the Caddy section below:

```bash
bash scripts/deploy/aapanel-add-site.sh task.joydigi.net 5173
```

It writes `/www/server/panel/vhost/nginx/<domain>.conf`, validates the ACME path
locally and publicly, issues the certificate via webroot, installs the certbot
deploy hook, then rewrites the vhost with TLS. It reloads through
`/etc/init.d/nginx reload`, never `systemctl reload nginx` — on an aaPanel box
the systemd unit calls `/usr/sbin/nginx` and fails with
`invalid PID number "" in "/run/nginx.pid"`.

Existing vhosts are never read or modified; one for the same domain is backed
up first.

Four things to know before running it on a box with a live app:

- **Kaneo brings its own PostgreSQL container.** It does not touch an existing
  database, and `compose.yml` does not publish 5432, so it cannot collide with
  a PostgreSQL already running on the host.
- **Port 5173 must be free.** Check with `ss -lntp | grep 5173`.
- **Building competes with the live app for memory.** The Vite build wants
  ~4 GB; on a box already running another service the OOM killer may take that
  service down rather than the build. Check `free -h` first, add swap if
  needed, and build during a quiet window.
- **`KANEO_CLIENT_URL` must be the exact public URL**, no trailing slash. It has
  to match the R2 bucket's CORS origin or image uploads fail in the browser.

Order of operations:

```bash
cd /opt/kaneo && bash scripts/deploy/deploy.sh
```

```bash
bash scripts/deploy/aapanel-add-site.sh task.joydigi.net 5173
```

Deploy first so something answers on 5173; the site script warns but continues
if nothing is listening yet.

Once the vhost works, keep the app port off the public interface. Docker
publishes ports ahead of ufw, so without this `<public-ip>:5173` answers
directly, bypassing Cloudflare and the vhost:

```bash
echo 'KANEO_BIND_ADDRESS=127.0.0.1' >> .env && docker compose -f compose.yml -f compose.build.yml up -d
```

## 3b. Put TLS in front (clean server, no aaPanel)

Do not expose port 5173 directly. Caddy is the shortest path to automatic
certificates:

```bash
sudo apt install -y caddy
```

`/etc/caddy/Caddyfile`:

```
kaneo.example.com {
    reverse_proxy 127.0.0.1:5173
}
```

```bash
sudo systemctl reload caddy
```

Then make sure `KANEO_CLIENT_URL` in `.env` is the **https** URL and restart:

```bash
docker compose -f compose.yml -f compose.build.yml up -d
```

WebSockets power the realtime board updates; Caddy proxies them without extra
configuration. If you use nginx instead, remember `proxy_set_header Upgrade`
and `Connection "upgrade"`, otherwise boards stop updating live.

Close the app port to the outside once the proxy is in place:

```bash
sudo ufw allow 80,443/tcp
sudo ufw deny 5173/tcp
```

## 4. Uploads on Cloudflare R2

Kaneo talks to any S3-compatible store through the `S3_*` variables; R2 is one
of them, so this is configuration, not a code change. Until they are set,
uploading an image fails with "Uploads are not configured".

Create the bucket and an **R2 API token** with Object Read & Write in the
Cloudflare dashboard.

### From GitHub Actions (recommended)

Add four repository secrets under **Settings → Secrets and variables →
Actions**, then push or re-run the **Fork CI and deploy** workflow:

| Secret | Value |
| --- | --- |
| `R2_ACCOUNT_ID` | the Cloudflare account id (or the `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` endpoint; a `/<bucket>` copied after it is dropped) |
| `R2_BUCKET` | the bucket name, e.g. `kaneo-uploads` |
| `R2_ACCESS_KEY_ID` | the token's Access Key ID |
| `R2_SECRET_ACCESS_KEY` | the token's Secret Access Key |

Every deploy writes them into the server's `.env` as the `S3_*` lines below,
replacing whatever was there, so rotate a key by changing the secret and
redeploying. Without the secrets the deploy leaves `.env` alone.

### By hand

Uncomment and fill these in `.env` on the server:

```env
S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_BUCKET=kaneo-uploads
S3_ACCESS_KEY_ID=<R2_ACCESS_KEY_ID>
S3_SECRET_ACCESS_KEY=<R2_SECRET_ACCESS_KEY>
S3_REGION=auto
S3_FORCE_PATH_STYLE=false
```

Two things that are easy to get wrong:

- **Use the S3 API endpoint**, `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
  — not the public `*.r2.dev` domain, which cannot accept signed uploads.
- **`S3_FORCE_PATH_STYLE=false` must be set explicitly.** The code defaults it
  to `true` for MinIO.

The bucket does **not** need to be public: Kaneo streams assets back through
its own API, so objects stay private.

### Bucket CORS is required

The browser PUTs directly to R2 with a presigned URL, so without a CORS rule
every upload fails in the browser while the server logs nothing. In the bucket's
**Settings → CORS policy**, add:

```json
[
  {
    "AllowedOrigins": ["https://kaneo.example.com"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

`AllowedOrigins` must match `KANEO_CLIENT_URL` exactly — scheme, host and port,
no trailing slash. Only `content-type` is needed in `AllowedHeaders`;
`Content-Length` is signed but the browser sets it itself.

Apply the change and verify. `--force-recreate` matters: a plain `up -d` can
leave the running container on its old environment.

```bash
docker compose -f compose.yml -f compose.build.yml up -d --force-recreate kaneo
```

Then open a task, drag an image into the description, and confirm it renders.
If it fails, the browser console distinguishes the two cases: a CORS message
means the bucket policy, a 403 from the PUT means the token or endpoint.

## 5. Schedule backups

`scripts/backup/backup-database.sh` dumps the database out of the Postgres
container. Add it to the root crontab:

```bash
sudo crontab -e
```

```
0 2 * * * cd /opt/kaneo && /usr/bin/bash scripts/backup/backup-database.sh >> /var/log/kaneo-backup.log 2>&1
```

Archives land in `backups/` with 14-day retention. Override with
`KANEO_BACKUP_DIR` and `KANEO_BACKUP_RETENTION_DAYS`. Keep a copy off this
server — a backup on the same disk does not survive losing the disk.

Test a restore before you rely on it:

```bash
docker compose exec -T postgres createdb -U kaneo kaneo_restore
docker compose exec -T postgres pg_restore -U kaneo -d kaneo_restore --clean --if-exists \
  < backups/kaneo-<stamp>.dump
docker compose exec -T postgres psql -U kaneo -d kaneo_restore -c 'select count(*) from task;'
docker compose exec -T postgres dropdb -U kaneo kaneo_restore
```

## 6. Check what is being served

```bash
bash scripts/deploy/verify-web-integrity.sh
```

It renders the public configuration into a throwaway container from the same
image and compares that web root, file by file, with the running container's;
lists any change in the container's filesystem that the image does not
explain; and fetches `index.html` and the assets it references through the
local port and the public URL. Any difference exits non-zero. The deploy runs
it at the end, and it is cheap enough to run from cron.

If it fails, or if the deploy stops on a modified checkout, follow
[RECOVERY.md](./RECOVERY.md): evidence first, then a clean rebuild, then new
secrets, then a fresh host.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| Build dies with `exit code 137` | Out of memory. Add swap (see Requirements). |
| Deploy stops: "differs from the committed tree" | Files on the server were edited or added outside git. Inspect them; see [RECOVERY.md](./RECOVERY.md). |
| Deploy stops: "Verification failed" | The container serves something its image does not produce, or the public URL returns something else, often a CDN still serving cached old assets. Purge the cache and re-run the check; otherwise see [RECOVERY.md](./RECOVERY.md). |
| `DATABASE_URL is not set and POSTGRES_PASSWORD is not set` | `.env` is missing or `POSTGRES_PASSWORD` is empty. |
| App loads but sign-in fails after restart | `AUTH_SECRET` is unset, so a random one is generated per start. |
| Board does not update live | The reverse proxy is not forwarding WebSocket upgrades. |
| Timestamps show hours in the future | Only affects rows written before the UTC fix; new rows are correct. |
