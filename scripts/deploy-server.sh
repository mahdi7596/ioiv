#!/usr/bin/env bash
# Deploy the latest GitHub master to the production server.
#
# Run on the server, from the git checkout that is also the Compose project:
#   cd /data/apps/sana && bash scripts/deploy-server.sh
#
# It fast-forwards to origin/master, builds sana-app:<short-sha> on the server,
# points docker-compose.release.yml at it, recreates only the app container and
# rolls back automatically if the new container does not become healthy.
#
# It refuses to continue when the update contains migrations, runtime grant
# changes, or Compose/env contract changes: those need the manual procedure in
# DEPLOYMENT.md (fresh backup, migrate image, grants) before the app switch.
# After doing those steps, rerun with --manual-steps-done to deploy the app.
#
# The whole body is inside main() so bash parses it completely before
# `git merge` can replace this file on disk.

set -euo pipefail

main() {
  local manual_steps_done=false
  case "${1:-}" in
    "") ;;
    --manual-steps-done) manual_steps_done=true ;;
    *) echo "Usage: bash scripts/deploy-server.sh [--manual-steps-done]" >&2; exit 2 ;;
  esac
  local release_file=docker-compose.release.yml
  local compose=(docker compose -f docker-compose.yml -f "$release_file")

  if [[ ! -f docker-compose.yml || ! -f "$release_file" || ! -d .git ]]; then
    echo "Run this from /data/apps/sana (git checkout with $release_file)." >&2
    exit 1
  fi

  if [[ "$(git symbolic-ref --short -q HEAD || true)" != master ]]; then
    echo "The checkout is not on branch master; refusing to deploy." >&2
    exit 1
  fi

  if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
    echo "Tracked files have local changes; refusing to deploy:" >&2
    git status --short --untracked-files=no >&2
    exit 1
  fi

  local current_tag
  current_tag=$(sed -nE 's/^[[:space:]]*image:[[:space:]]*sana-app:([^[:space:]]+).*/\1/p' "$release_file")
  if [[ -z "$current_tag" ]]; then
    echo "Could not read the current sana-app tag from $release_file." >&2
    exit 1
  fi

  git fetch -q origin master
  local target target_short
  target=$(git rev-parse origin/master)
  target_short=$(git rev-parse --short=7 "$target")

  echo "Deployed: sana-app:$current_tag"
  echo "Target:   sana-app:$target_short ($(git log -1 --format=%s "$target"))"

  if [[ "$current_tag" == "$target_short" ]]; then
    echo "Already on the latest master; nothing to deploy."
    exit 0
  fi

  if ! git cat-file -e "$current_tag^{commit}" 2>/dev/null; then
    echo "Deployed tag $current_tag is not a commit in this checkout; compare manually." >&2
    exit 1
  fi

  echo
  echo "Commits to deploy:"
  git log --oneline "$current_tag..$target"

  local manual
  manual=$(git diff --name-only "$current_tag" "$target" -- \
    prisma/migrations prisma/schema.prisma 'prisma/*.sql' prisma.config.ts \
    package.json package-lock.json \
    docker-compose.yml .env.runtime.example .env.migration.example)
  if [[ -n "$manual" ]]; then
    echo >&2
    echo "This update changes files that need manual deployment steps:" >&2
    echo "$manual" >&2
    if [[ "$manual_steps_done" != true ]]; then
      echo "Follow 'Deploy Code Changes > Updates that need manual steps' in DEPLOYMENT.md," >&2
      echo "then rerun: bash scripts/deploy-server.sh --manual-steps-done" >&2
      exit 1
    fi
    echo "Continuing: --manual-steps-done confirms those steps were completed." >&2
  fi

  echo
  read -r -p "Deploy these commits to production? [y/N] " answer
  [[ "$answer" == "y" || "$answer" == "Y" ]] || { echo "Cancelled."; exit 1; }

  git merge -q --ff-only "$target"

  echo "Building sana-app:$target_short (the live app keeps serving)..."
  docker build -t "sana-app:$target_short" \
    --label "org.opencontainers.image.revision=$target" .

  cp "$release_file" "$release_file.bak-$current_tag"
  sed -i -E "s/^([[:space:]]*image:[[:space:]]*sana-app:)[^[:space:]]+/\1$target_short/" "$release_file"

  if "${compose[@]}" up -d --no-deps --no-build app && wait_healthy; then
    docker compose ps app
    echo "Deployed sana-app:$target_short."
    echo "Rollback: cp $release_file.bak-$current_tag $release_file && ${compose[*]} up -d --no-deps --no-build app"
    return 0
  fi

  echo "sana-app:$target_short did not become healthy. Rolling back to sana-app:$current_tag." >&2
  docker compose logs --tail=60 app >&2 || true
  cp "$release_file.bak-$current_tag" "$release_file"
  if "${compose[@]}" up -d --no-deps --no-build app && wait_healthy; then
    echo "Rolled back and healthy. Source checkout stays at $target_short; the running image is $current_tag." >&2
  else
    echo "ROLLBACK DID NOT BECOME HEALTHY. Check 'docker compose ps' and 'docker compose logs app' now." >&2
  fi
  exit 1
}

# Compose healthcheck: 20s start period, 30s interval, 5 retries, so an
# unhealthy verdict can take about 3 minutes. Wait up to 4 minutes.
wait_healthy() {
  local status=""
  echo "Waiting for the app container to become healthy..."
  for _ in $(seq 1 48); do
    sleep 5
    status=$(docker inspect -f '{{.State.Health.Status}}' sana-app 2>/dev/null || echo missing)
    case "$status" in
      healthy) return 0 ;;
      unhealthy) break ;;
    esac
  done
  echo "Container health: $status" >&2
  return 1
}

main "$@"
exit $?
