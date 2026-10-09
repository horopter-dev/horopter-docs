# shellcheck shell=bash
# Sourced by setup.mdx's front matter, in the steps' shell.
set -euo pipefail

echo "building the world for Horopter ${HOROPTER_VERSION:?the harness exports it}"
export WORLD="built by setup.sh"
mkdir world
cd world
