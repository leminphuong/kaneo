#!/usr/bin/env bash
#
# Check that the running Kaneo container serves exactly what its image
# produces, and that nothing reaches a browser that the container did not send.
#
#   bash scripts/deploy/verify-web-integrity.sh
#
# Read-only. It starts one throwaway container from the same image, renders the
# public configuration into it the way the entrypoint does, and compares a
# SHA-256 listing of that web root with the running container's. Any ADDED,
# MISSING or MODIFIED file is tampering or corruption. It then lists every
# other change in the container's filesystem, and finally fetches index.html
# and the assets it references through the local port and the public URL, so a
# proxy, a cache or an injection between the container and the user shows up.
#
# deploy.sh runs this after every deploy; run it by hand whenever the site
# misbehaves. It cannot see a modified build input, which is why deploy.sh
# builds from `git archive`: compare the image with a clean local build if the
# commit itself is in doubt.
#
# KANEO_SKIP_PUBLIC_CHECK=1 skips the public-URL comparison, for a proxy that
# legitimately rewrites responses (Cloudflare Rocket Loader, email obfuscation).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; RED=$'\033[0;31m'; NC=$'\033[0m'
ok()   { printf '%s  ok%s %s\n' "$GREEN" "$NC" "$1"; }
warn() { printf '%s  !!%s %s\n' "$YELLOW" "$NC" "$1"; }
die()  { printf '%s ERROR%s %s\n' "$RED" "$NC" "$1" >&2; exit 2; }
indent() { sed 's/^/      /'; }

DOCKER="docker"
if ! docker info >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1 && sudo docker info >/dev/null 2>&1; then
    DOCKER="sudo docker"
  else
    die "Cannot talk to the Docker daemon."
  fi
fi
COMPOSE="$DOCKER compose -f compose.yml -f compose.build.yml"
WEB_ROOT=/usr/share/nginx/html

# --- which container, which image, which commit ---------------------------
container="$($COMPOSE ps -q kaneo | head -n 1)"
[ -n "$container" ] || die "The kaneo container is not running."
image="$($DOCKER inspect --format '{{.Image}}' "$container")"
image_short="${image#sha256:}"
# Rebuilding moves the tag, and the containerd image store then drops the old
# image even while a container still runs it. Nothing can be rendered to compare
# against, so say what happened instead of failing on "No such image".
$DOCKER image inspect "$image" >/dev/null 2>&1 || die \
  "The container runs image ${image_short:0:12}, which no longer exists (the container was not recreated after the last build). Recreate it, then re-run this check: $COMPOSE up -d --force-recreate kaneo"
revision="$($DOCKER image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")"
echo "  container ${container:0:12}  image ${image_short:0:12}  commit ${revision:-unknown (image predates this check)}"
if [ -n "$revision" ] && git rev-parse --is-inside-work-tree >/dev/null 2>&1 \
   && [ "$revision" != "$(git rev-parse HEAD)" ]; then
  warn "HEAD is $(git rev-parse --short HEAD) but the running image was built from ${revision:0:7}."
fi

# --- the public values the entrypoint rendered into the assets ------------
container_env() { $DOCKER exec "$container" printenv "$1" 2>/dev/null || true; }
client_url="$(container_env KANEO_CLIENT_URL)"
api_url="$(container_env KANEO_API_URL)"
turnstile="$(container_env KANEO_TURNSTILE_SITE_KEY)"
# kaneo-entrypoint.sh derives KANEO_API_URL from KANEO_CLIENT_URL inside its
# own shell, where `docker exec` cannot see it. Same derivation, same bytes.
client_url_trimmed="$(printf '%s' "$client_url" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
if [ -z "$api_url" ] && [ -n "$client_url_trimmed" ]; then
  api_url="${client_url_trimmed%/}/api"
fi

# --- the web root, as served and as the image renders it ------------------
list_files="cd $WEB_ROOT && find . -type f -exec sha256sum {} + | LC_ALL=C sort -k 2"
expected="$(mktemp)"; actual="$(mktemp)"; fetched="$(mktemp)"
trap 'rm -f "$expected" "$actual" "$fetched"' EXIT

$DOCKER exec "$container" sh -c "$list_files" > "$actual"
$DOCKER run --rm --entrypoint sh \
  -e "KANEO_API_URL=$api_url" \
  -e "KANEO_CLIENT_URL=$client_url" \
  -e "KANEO_TURNSTILE_SITE_KEY=$turnstile" \
  "$image" -c "/docker-entrypoint.d/env.sh >/dev/null 2>&1 && $list_files" > "$expected"
[ -s "$expected" ] || die "Could not render the expected web root from the image."

status=0
differences="$(awk '
  NR == FNR { expected[$2] = $1; next }
  {
    if (!($2 in expected)) print "ADDED    " $2
    else if (expected[$2] != $1) print "MODIFIED " $2
    delete expected[$2]
  }
  END { for (f in expected) print "MISSING  " f }
' "$expected" "$actual" | LC_ALL=C sort)"
if [ -n "$differences" ]; then
  warn "The served web root differs from what the image renders:"
  printf '%s\n' "$differences" | indent
  status=1
else
  ok "Web root matches the image ($(wc -l < "$actual" | tr -d ' ') files)"
fi

# --- everything else in the container -------------------------------------
# The entrypoint rewrites every served *.js and writes the two MCP OAuth
# documents at start; nginx keeps its pid, logs and request temp files.
# Nothing else in the container may change.
baseline='^[AC] /(var/)?run(/.*)?$'
baseline="$baseline"'|^C /usr/share/nginx/html(/assets)?$'
baseline="$baseline"'|^C /usr/share/nginx/html/assets/[^/]+\.js$'
baseline="$baseline"'|^[AC] /usr/share/nginx/html/mcp-oauth-(resource|authorization)\.json$'
baseline="$baseline"'|^[AC] /var/lib/nginx(/tmp(/.*)?)?$'
baseline="$baseline"'|^[AC] /var/log/nginx(/.*)?$'
# `docker diff` also marks every ancestor of a changed path as C. A C on a
# directory says only that something below it changed, and that something is
# listed on its own line and judged above, so the bare ancestors are noise.
baseline="$baseline"'|^C /(usr|usr/share|usr/share/nginx|var|var/lib|var/log)$'
unexpected="$($DOCKER diff "$container" | grep -Ev "$baseline" || true)"
if [ -n "$unexpected" ]; then
  warn "Changes in the container filesystem that nothing in the image explains:"
  printf '%s\n' "$unexpected" | indent
  status=1
else
  ok "No unexpected changes in the container filesystem"
fi

# --- what a browser receives ----------------------------------------------
# index.html and every asset it references, compared with the container's
# copy: through the local port (must match) and through the public URL
# (a mismatch is a proxy, a stale cache or an injection in between).
paths="$( { printf '/index.html\n'; $DOCKER exec "$container" cat "$WEB_ROOT/index.html" \
  | grep -oE '/assets/[A-Za-z0-9_.-]+\.(js|css)'; } | LC_ALL=C sort -u || true)"

fetch_matches() {   # base-url path expected-sha256 -> 0 match, 1 differs, 2 unreachable
  local base="$1" path="$2" want="$3" got
  curl -fsS --max-time 20 -H 'Cache-Control: no-cache' -o "$fetched" "$base$path" || return 2
  got="$(sha256sum "$fetched" | cut -d ' ' -f 1)"
  [ "$got" = "$want" ]
}

check_origin() {   # label base-url -> prints findings, returns 1 on any mismatch
  local label="$1" base="$2" path want rc checked=0 mismatched=0 unreachable=0
  while IFS= read -r path; do
    [ -n "$path" ] || continue
    want="$(awk -v p=".$path" '$2 == p { print $1 }' "$actual")"
    if [ -z "$want" ]; then
      warn "$path is referenced by index.html but is not in the container"
      mismatched=$((mismatched + 1))
      continue
    fi
    rc=0; fetch_matches "$base" "$path" "$want" || rc=$?
    case "$rc" in
      0) checked=$((checked + 1)) ;;
      2) unreachable=$((unreachable + 1)) ;;
      *) warn "$label: $base$path is not the container's copy"; mismatched=$((mismatched + 1)) ;;
    esac
  done <<< "$paths"
  if [ "$unreachable" -gt 0 ]; then
    warn "$label: $unreachable of the files could not be fetched from $base"
  fi
  if [ "$mismatched" -gt 0 ]; then
    return 1
  fi
  ok "$label: $checked files received as the container serves them"
}

if ! check_origin "local port" "http://127.0.0.1:5173"; then
  warn "The container's nginx is not sending its own files; inspect the container."
  status=1
fi
if [ "${KANEO_SKIP_PUBLIC_CHECK:-}" = "1" ]; then
  warn "KANEO_SKIP_PUBLIC_CHECK=1: the public URL was not compared"
elif [ -z "$client_url_trimmed" ]; then
  warn "KANEO_CLIENT_URL is empty: the public URL was not compared"
elif ! check_origin "public URL" "${client_url_trimmed%/}"; then
  warn "Users receive something other than what the container serves."
  warn "Purge the CDN cache first; a persisting mismatch is the reverse proxy or the CDN."
  status=1
fi

if [ "$status" -ne 0 ]; then
  warn "Do not delete or overwrite anything yet: scripts/deploy/RECOVERY.md"
fi
exit "$status"
