#!/usr/bin/env bash
#
# Back up the Kaneo database running in Docker Compose, and prune old archives.
#
#   bash scripts/backup/backup-database.sh
#
# Writes a pg_dump custom-format archive (-Fc), which is compressed and can be
# restored selectively with pg_restore. Credentials come from the repository's
# .env so they are not duplicated here.
#
# Pruning only runs after a successful dump, so a failed run can never delete
# the last good copy. A failed dump exits non-zero so cron reports it.
#
# Restore into a scratch database:
#   docker compose exec -T postgres createdb -U kaneo kaneo_restore
#   docker compose exec -T postgres pg_restore -U kaneo -d kaneo_restore \
#     --clean --if-exists < backups/kaneo-YYYYmmdd-HHMMSS.dump

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

BACKUP_DIR="${KANEO_BACKUP_DIR:-$REPO_ROOT/backups}"
RETENTION_DAYS="${KANEO_BACKUP_RETENTION_DAYS:-14}"
SERVICE="${KANEO_POSTGRES_SERVICE:-postgres}"

mkdir -p "$BACKUP_DIR"
LOG_FILE="$BACKUP_DIR/backup.log"

log() { printf '%s [%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${2:-INFO}" "$1" | tee -a "$LOG_FILE"; }

[ -f .env ] || { log "No .env at $REPO_ROOT" ERROR; exit 1; }

# Read only the keys we need rather than sourcing .env, which would execute it.
read_env() { sed -n "s/^$1=//p" .env | tail -n1 | tr -d '\r' | sed 's/^"//;s/"$//'; }
DB_NAME="$(read_env POSTGRES_DB)";  DB_NAME="${DB_NAME:-kaneo}"
DB_USER="$(read_env POSTGRES_USER)"; DB_USER="${DB_USER:-kaneo}"

DOCKER="docker"
docker info >/dev/null 2>&1 || DOCKER="sudo docker"
COMPOSE="$DOCKER compose"

if ! $COMPOSE ps --status running --services 2>/dev/null | grep -qx "$SERVICE"; then
  log "Compose service '$SERVICE' is not running" ERROR
  exit 1
fi

STAMP="$(date -u +%Y%m%d-%H%M%S)"
TARGET="$BACKUP_DIR/kaneo-$STAMP.dump"

log "Backing up database '$DB_NAME' to $TARGET"

# -T: no TTY, so the binary archive reaches the file unmangled.
if ! $COMPOSE exec -T "$SERVICE" \
      pg_dump -U "$DB_USER" -d "$DB_NAME" --format=custom --no-owner --no-privileges \
      > "$TARGET"; then
  log "pg_dump failed" ERROR
  rm -f "$TARGET"
  exit 1
fi

if [ ! -s "$TARGET" ]; then
  log "Backup file is empty - treating as failure" ERROR
  rm -f "$TARGET"
  exit 1
fi

log "Backup succeeded ($(du -h "$TARGET" | cut -f1))"

pruned=0
while IFS= read -r -d '' old; do
  rm -f "$old"
  log "Pruned $(basename "$old") (older than $RETENTION_DAYS days)"
  pruned=$((pruned + 1))
done < <(find "$BACKUP_DIR" -maxdepth 1 -name 'kaneo-*.dump' -type f -mtime "+$RETENTION_DAYS" -print0)

kept=$(find "$BACKUP_DIR" -maxdepth 1 -name 'kaneo-*.dump' -type f | wc -l)
log "Done. $kept archive(s) in $BACKUP_DIR, $pruned pruned"
