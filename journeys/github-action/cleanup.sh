#!/usr/bin/env bash
# github-action.mdx's cleanup, run in the directory setup.sh started in. It copes with a setup
# that stopped before the stack existed.
set -euo pipefail

if [[ -f docker-compose.yaml ]]; then
  docker compose --project-name horopter-docs-github-action down --volumes
fi
