#!/usr/bin/env bash
# grafana.mdx's cleanup, run in the directory setup.sh started in. It copes with a setup that
# stopped part-way: no Grafana, or no stack.
set -euo pipefail

project=horopter-docs-grafana

docker rm --force --volumes "$project-grafana" > /dev/null 2>&1 || true
if [[ -f docker-compose.yaml ]]; then
  docker compose --project-name "$project" down --volumes
fi
