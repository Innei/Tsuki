#!/bin/bash
set -euo pipefail

mask_url() {
  local raw="${1:-}"
  if [ -z "$raw" ]; then
    echo "<unset>"
    return
  fi
  echo "$raw" | sed -E 's#(://[^:@/]+):[^@]+@#\1:************@#'
}

parse_booleanish() {
  case "${1:-}" in
    true | TRUE | 1 | yes | YES | on | ON) echo "true" ;;
    false | FALSE | 0 | no | NO | off | OFF) echo "false" ;;
    *) echo "" ;;
  esac
}

echo "============== Tsuki starter =============="
echo "- Node:         $(node -v 2> /dev/null || echo '<missing>')"
echo "- PWD:          $(pwd)"
echo "- Listen:       ${HOSTNAME:-0.0.0.0}:${PORT:-3000}"
echo "- DATABASE_URL: $(mask_url "${DATABASE_URL:-}")"
echo "- REDIS_URL:    $(mask_url "${REDIS_URL:-}")"
echo "- MIGRATIONS:   ${MIGRATIONS_DIR:-/app/drizzle}"
echo "- AUTO_MIGRATE: ${AUTO_MIGRATE:-true}"
echo "==========================================="

if [ "${1:-}" != "" ] && [[ "${1:-}" != -* ]]; then
  echo "Exec: $*"
  exec "$@"
fi

if [ "$(parse_booleanish "${AUTO_MIGRATE:-true}")" = "true" ]; then
  echo "Running database migrations (advisory-locked)…"
  if ! node migrate.mjs; then
    echo "Migration failed. Aborting." >&2
    exit 1
  fi
else
  echo "Skipping auto-migrate (AUTO_MIGRATE=${AUTO_MIGRATE})"
fi

echo "Exec: node main.mjs ${*:-<none>}"
exec node main.mjs "$@"
