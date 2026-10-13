#!/usr/bin/env bash
# shellcheck disable=SC2154 # the harness exports the pins in versions
# flux.mdx's cleanup, run in the directory setup.sh started in. It copes with a setup that
# stopped part-way: no background loops, or no cluster.
set -euo pipefail

for pid_file in port-forward.pid helmrepository-patch.pid; do
  if [[ -f $pid_file ]]; then
    loop_pid=$(< "$pid_file")
    children=$(pgrep -P "$loop_pid" || true)
    kill "$loop_pid" 2> /dev/null || true
    if [[ -n "$children" ]]; then
      # shellcheck disable=SC2086 # one PID per word
      kill $children 2> /dev/null || true
    fi
  fi
done

mise exec "kind@$KIND_VERSION" -- kind delete cluster --name horopter-docs-flux
