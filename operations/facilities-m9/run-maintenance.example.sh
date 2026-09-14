#!/bin/sh
set -u

# Install outside the repository only after G2. The state directory must be writable
# only by the scheduler identity and scraped by the approved monitoring integration.
: "${FACILITIES_M9_STATE_DIR:?Set FACILITIES_M9_STATE_DIR to a protected state directory}"
: "${FACILITIES_M9_APP_DIR:=/data/apps/sana}"

cd "$FACILITIES_M9_APP_DIR" || exit 1
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

docker compose exec -T app npm run facilities:reconcile-files
reconcile_exit=$?

if [ "$reconcile_exit" -eq 0 ]; then
  date -u +%s > "$FACILITIES_M9_STATE_DIR/last-reconcile-success.epoch"
  docker compose exec -T app npm run facilities:check-readiness
  readiness_exit=$?
  if [ "$readiness_exit" -eq 0 ]; then
    date -u +%s > "$FACILITIES_M9_STATE_DIR/last-readiness-success.epoch"
    printf '{"event":"facilities_m9_maintenance","startedAt":"%s","reconcileExit":0,"readinessExit":0}\n' "$started_at"
    exit 0
  fi
  printf '{"event":"facilities_m9_maintenance","startedAt":"%s","reconcileExit":0,"readinessExit":1}\n' "$started_at" >&2
  exit 1
fi

if [ "$reconcile_exit" -eq 2 ]; then
  date -u +%s > "$FACILITIES_M9_STATE_DIR/last-reconcile-skip.epoch"
  printf '{"event":"facilities_m9_maintenance","startedAt":"%s","reconcileExit":2,"readinessExit":null}\n' "$started_at"
  exit 2
fi

printf '{"event":"facilities_m9_maintenance","startedAt":"%s","reconcileExit":1,"readinessExit":null}\n' "$started_at" >&2
exit 1
