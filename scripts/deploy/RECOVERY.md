# Recovering from a tampered deployment

Use this when the deploy stops on "differs from the committed tree", when
`verify-web-integrity.sh` reports a difference, or when the site serves
something the repository does not contain (an unknown `<script>`, hidden
links, a truncated asset, a blank page with syntax errors in the console).

The order matters: **evidence, then stop the bleeding, then rotate secrets,
then rebuild the host.** Cleaning first destroys the only record of what
happened and leaves the way in open.

What this looked like in October 2026: `index.html` on task.joydigi.net
carried an SEO-spam script before `</body>`, one JS chunk was cut off at
4096 bytes, and the same script sat on another site on the same server. A
local build of the same commit reproduced the asset names exactly, with the
injected script as the only difference, so the file had been edited in the
server's checkout and baked into the image by the next deploy. Nothing in git
or in the dependencies was involved. The repository changes that came out of
it are listed at the end.

## 1. Keep the evidence

Everything below is read-only. Run it as root on the server and keep the output
somewhere off the box.

```bash
mkdir -p /root/incident-$(date +%F) && cd /root/incident-$(date +%F)
git -C /opt/kaneo status --short --untracked-files=all > git-status.txt
git -C /opt/kaneo diff > git-diff.patch
git -C /opt/kaneo log -5 --format='%h %ci %s' > git-log.txt
docker compose -f /opt/kaneo/compose.yml -f /opt/kaneo/compose.build.yml ps > compose-ps.txt
docker diff "$(docker compose -f /opt/kaneo/compose.yml -f /opt/kaneo/compose.build.yml ps -q kaneo)" > docker-diff.txt
docker images --digests > docker-images.txt
docker ps -a > docker-ps.txt
```

Copy the tampered files themselves before touching them, for example:

```bash
cp /opt/kaneo/apps/web/index.html ./index.html.tampered
```

Then look for how they got there. Anything modified recently that you did not
change is a lead, and so is any user, key, cron entry or process you do not
recognise:

```bash
find /opt /www /etc /var/spool/cron /root /home -xdev -type f -mtime -14 -newer /opt/kaneo/.env 2>/dev/null | sort > recently-modified.txt
for u in $(cut -d: -f1 /etc/passwd); do crontab -l -u "$u" 2>/dev/null | sed "s/^/$u: /"; done > crontabs.txt
ls -la /etc/cron.d /etc/cron.hourly /etc/cron.daily > cron-dirs.txt
find / -xdev -name authorized_keys -exec sh -c 'echo "== $1"; cat "$1"' sh {} \; > authorized-keys.txt 2>/dev/null
ss -lntp > listening.txt
ps auxf > processes.txt
last -F > logins.txt
cp /var/log/auth.log* . 2>/dev/null
tar czf aapanel-logs.tgz /www/server/panel/logs /www/wwwlogs 2>/dev/null
```

If another site on the same server shows the same injection, the host itself
is compromised, not just this checkout. On this server the Workspace site is
WordPress; a vulnerable plugin or theme is the usual way in, and anything
running as the web user, or anything the panel can reach, is suspect.

## 2. Stop the bleeding

Put the site back on a known-good build. The deploy script now refuses a
modified checkout and builds from the commit, so this is a clean image even
when the way in is still unknown.

```bash
cd /opt/kaneo
git status --short --untracked-files=all      # the list from step 1
git checkout -- apps/web/index.html           # one line per tampered tracked file
git clean -n                                  # review; then git clean -f <path> for files that should not exist
git fetch --no-tags origin main && git merge --ff-only origin/main
KANEO_BUILD_NO_CACHE=1 bash scripts/deploy/deploy.sh
```

`KANEO_BUILD_NO_CACHE=1` rebuilds every layer rather than reusing ones that
were produced while the host was compromised. The script ends with the
integrity check. On the first run after an incident expect it to stop on a
`public URL` mismatch: the container is clean, but Cloudflare still serves the
assets it cached while the site was tampered with (asset names are content
hashes, so a chunk that did not change keeps its name and its stale cache).

So purge the CDN now. Cloudflare dashboard → Caching → Configuration →
**Purge Everything**. Then run the check again; it must pass:

```bash
bash scripts/deploy/verify-web-integrity.sh
```

Confirm from outside the server:

```bash
curl -s https://task.joydigi.net/ | grep -c '__contentLoaded'    # must print 0
```

Lock the app port to the proxy while you are here. Docker publishes ports ahead
of ufw, so `<public-ip>:5173` is otherwise reachable directly, bypassing
Cloudflare and the vhost:

```bash
grep -q '^KANEO_BIND_ADDRESS=' .env || echo 'KANEO_BIND_ADDRESS=127.0.0.1' >> .env
docker compose -f compose.yml -f compose.build.yml up -d
```

## 3. Treat every secret on the box as known

`.env` is readable by anyone with filesystem access, and so is the database.
Rotate, in this order:

| Secret | Where | Effect |
| --- | --- | --- |
| `AUTH_SECRET` | `.env`, then `up -d` | Every session cookie stops validating; everyone signs in again. |
| `POSTGRES_PASSWORD` | `ALTER USER kaneo PASSWORD '...'` in the postgres container, then `.env`, then `up -d` | Closes database access from any copied `.env`. |
| S3 / R2 keys | Cloudflare R2 dashboard, then `.env` | Uploads were reachable with the old key. |
| `WORKSPACE_SSO_SECRET` and the Workspace side | both apps | See the SSO note below. |
| `DEPLOY_SSH_KEY` | new key pair; replace in GitHub secrets and in the server's `authorized_keys` | The old private key only ever lived in GitHub, but the public half was on the box. |
| SSH passwords and keys, aaPanel password, Cloudflare API tokens, SMTP, Telegram bot tokens, GitHub app keys | wherever they are configured | Anything stored on the host or in its database. |

After rotating `AUTH_SECRET`, also clear long-lived API access that does not
depend on it: review and delete unknown entries in the Kaneo admin pages for
users, API keys, and MCP clients, and remove any instance administrator you
did not create.

**Workspace SSO:** Kaneo signs users in on the strength of the JSON the
Workspace exchange endpoint returns. While the Workspace host is compromised,
that endpoint can mint a Kaneo session for any verified account, including
administrators. Disable it until the Workspace host is clean:

```bash
sed -i 's/^WORKSPACE_SSO_/#WORKSPACE_SSO_/' .env
docker compose -f compose.yml -f compose.build.yml up -d
```

The same host is also allowed to embed Kaneo in a frame
(`frame-ancestors` in `apps/web/nginx.kaneo.conf`), which is what the
Workspace shell needs but also what lets a hostile page there overlay the MCP
consent screen. Consider removing it from the policy for the duration.

## 4. Rebuild the host

A server that someone else could write to cannot be trusted again by cleaning
files: you only find what you know to look for. Reinstall it, or move Kaneo to
its own VPS, and restore only data:

- Database: `scripts/backup/backup-database.sh` before the move, restore on
  the new host, then review the `user`, `api_key` and session tables for
  entries you do not recognise.
- Nothing else from the old disk. The checkout comes from GitHub, the image
  is rebuilt, `.env` is written fresh with new secrets.

On the new host keep the app port on localhost (`KANEO_BIND_ADDRESS`), let only
the reverse proxy face the internet, and give the deploy user no more than it
needs.

## 5. Afterwards

- Search Console: request a review once the spam is gone, so the domain is not
  flagged for the injected links.
- Re-run `bash scripts/deploy/verify-web-integrity.sh` from cron for a while;
  a non-zero exit is the alarm.
- Check the other sites on the old host the same way; the spam script was the
  same on both.

## What the repository now does about it

- `scripts/deploy/deploy.sh` and `.github/workflows/fork-deploy.yml` refuse a
  checkout that differs from git, and the image is built from `git archive
  HEAD`, so a file edited or dropped on the server can no longer ship.
  Base images are re-pulled on every build; `KANEO_BUILD_NO_CACHE=1` discards
  cached layers.
- The image records the commit it was built from
  (`org.opencontainers.image.revision`), and `verify-web-integrity.sh` compares
  the served files with what that image renders, with the container's
  filesystem, and with what the local port and the public URL return.
- `compose.yml` runs the container with no capabilities, no privilege
  escalation and a process limit, and `KANEO_BIND_ADDRESS` keeps the port off
  the public interface.

What it cannot do: protect a host someone else controls. An attacker with root
can change the checkout, the `.git` objects, `.env`, the Docker cache, the
proxy in front, or this very script. The guard and the verification are there
to make that visible, not to make it impossible.
