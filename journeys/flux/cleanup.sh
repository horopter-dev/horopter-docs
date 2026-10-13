#!/usr/bin/env bash
# shellcheck disable=SC2154 # the harness exports the pins in versions
# flux.mdx's cleanup, run in the directory setup.sh started in. It copes with a setup that
# stopped part-way: no port-forward, or no cluster.
set -euo pipefail

if [[ -f port-forward.pid ]]; then
  loop_pid=$(< port-forward.pid)
  forwards=$(pgrep -P "$loop_pid" || true)
  kill "$loop_pid" 2> /dev/null || true
  if [[ -n "$forwards" ]]; then
    # shellcheck disable=SC2086 # one PID per word
    kill $forwards 2> /dev/null || true
  fi
fi

mise exec "kind@$KIND_VERSION" -- kind delete cluster --name horopter-docs-flux
