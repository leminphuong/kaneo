#!/usr/bin/env bash
#
# Initialise git (if needed), commit everything, and push to your own GitHub repo.
#
#   bash scripts/deploy/push-to-github.sh git@github.com:you/kaneo.git
#   bash scripts/deploy/push-to-github.sh            # reuses the existing remote
#
# Safe to re-run: after the first push it just commits new changes and pushes.
#
# It refuses to commit when a file holding secrets would be included. This repo
# keeps real credentials in .env (database password, AUTH_SECRET, R2 keys), so
# that check is the difference between a private config file and a public leak.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

BLUE=$'\033[0;34m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; RED=$'\033[0;31m'; NC=$'\033[0m'
step() { printf '%s==>%s %s\n' "$BLUE" "$NC" "$1"; }
ok()   { printf '%s  ok%s %s\n' "$GREEN" "$NC" "$1"; }
warn() { printf '%s  !!%s %s\n' "$YELLOW" "$NC" "$1"; }
die()  { printf '%s ERROR%s %s\n' "$RED" "$NC" "$1" >&2; exit 1; }

REMOTE_URL="${1:-}"
BRANCH="${PUSH_BRANCH:-main}"

command -v git >/dev/null 2>&1 || die "git is not installed."

# --- repository -----------------------------------------------------------
if [ ! -d .git ]; then
  step "No .git here - initialising a fresh repository"
  git init -q
  git symbolic-ref HEAD "refs/heads/$BRANCH"
  ok "Initialised on branch $BRANCH"
else
  current="$(git symbolic-ref --quiet --short HEAD || echo "")"
  [ -n "$current" ] && BRANCH="$current"
  ok "Existing repository on branch $BRANCH"
fi

# CRLF checkouts make Biome fail on every file and block the pre-commit hook.
if [ "$(git config --get core.autocrlf || echo)" = "true" ]; then
  git config core.autocrlf false
  warn "Set core.autocrlf=false (true makes Biome reject every file)"
fi

# --- identity -------------------------------------------------------------
if [ -z "$(git config --get user.email || echo)" ]; then
  read -r -p "git user.email: " email
  read -r -p "git user.name: " name
  [ -n "$email" ] && [ -n "$name" ] || die "Both are required to commit."
  git config user.email "$email"
  git config user.name "$name"
fi

# --- remote ---------------------------------------------------------------
if [ -n "$REMOTE_URL" ]; then
  if git remote get-url origin >/dev/null 2>&1; then
    git remote set-url origin "$REMOTE_URL"
  else
    git remote add origin "$REMOTE_URL"
  fi
fi
git remote get-url origin >/dev/null 2>&1 || die \
  "No remote. Create an empty repo on GitHub, then re-run with its URL:
  bash scripts/deploy/push-to-github.sh git@github.com:you/kaneo.git"
ok "origin -> $(git remote get-url origin)"

# --- stage ----------------------------------------------------------------
step "Staging changes"
git add -A

# --- secret guard ---------------------------------------------------------
step "Checking that no secrets are staged"
SECRET_PATHS=".env .env.local .env.production.local"
leaked=""
for path in $SECRET_PATHS; do
  if git diff --cached --name-only -- "$path" | grep -q .; then
    leaked="$leaked $path"
  fi
done
# Any file that is not .env.sample but carries a live-looking secret assignment.
while IFS= read -r file; do
  [ -f "$file" ] || continue
  case "$file" in *.sample|*.example|*/README.md) continue ;; esac
  if grep -qE '^(AUTH_SECRET|POSTGRES_PASSWORD|S3_SECRET_ACCESS_KEY|S3_ACCESS_KEY_ID)=[^<[:space:]]' "$file" 2>/dev/null; then
    leaked="$leaked $file"
  fi
done < <(git diff --cached --name-only)

if [ -n "$leaked" ]; then
  unique="$(printf '%s\n' $leaked | sort -u | tr '\n' ' ')"
  git reset -q
  die "Refusing to commit - these would publish secrets: ${unique% }
Unstaged everything. Add them to .gitignore, then re-run."
fi
ok "No secrets staged"

# Windows records every file as 0644, so shell scripts arrive on the Linux
# server without the executable bit. Set it in the index, not on disk.
while IFS= read -r script; do
  [ -n "$script" ] || continue
  git update-index --chmod=+x "$script" 2>/dev/null || true
done < <(git diff --cached --name-only -- '*.sh')

if git diff --cached --quiet; then
  ok "Nothing to commit"
else
  step "Committing"
  MESSAGE="${COMMIT_MESSAGE:-}"
  if [ -z "$MESSAGE" ]; then
    if git rev-parse HEAD >/dev/null 2>&1; then
      MESSAGE="chore: update $(date -u +%Y-%m-%d\ %H:%M) UTC"
    else
      MESSAGE="chore: initial import of the Kaneo fork"
    fi
  fi
  # --no-verify is deliberately not used; if the hook fails, fix the cause.
  git commit -q -m "$MESSAGE"
  ok "$(git log -1 --oneline)"
fi

# --- push -----------------------------------------------------------------
step "Pushing to origin/$BRANCH"
if git push -u origin "$BRANCH"; then
  ok "Pushed."
else
  die "Push failed. Common causes:
  - The GitHub repo does not exist yet, or you lack write access to it.
  - The remote already has commits: pull first with
      git pull --rebase origin $BRANCH"
fi

url="$(git remote get-url origin)"
case "$url" in
  git@github.com:*) url="https://github.com/${url#git@github.com:}" ;;
esac
url="${url%.git}"
echo
echo "  Repo:    $url"
echo "  Actions: $url/actions"
echo
echo "To deploy automatically on push, set DEPLOY_ENABLED and the SSH secrets;"
echo "see scripts/deploy/README.md."
