# shellcheck shell=bash disable=SC2154 # the harness exports the pins in versions
# Sourced by grafana.mdx's front matter, in the steps' shell: builds what a reader already has,
# Horopter holding changes and a Grafana they can configure, and sets the variables the page's
# manual steps have a reader set.
set -euo pipefail

project=horopter-docs-grafana
release=https://github.com/horopter-dev/horopter/releases/download/$HOROPTER_VERSION

curl -fsSLO "$release/docker-compose.yaml"
docker compose --project-name "$project" up --detach --quiet-pull

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) platform=darwin_arm64 ;;
  Linux-x86_64) platform=linux_amd64 ;;
  Linux-aarch64 | Linux-arm64) platform=linux_arm64 ;;
  *)
    echo "no horo build for $(uname -s) $(uname -m)" >&2
    exit 1
    ;;
esac
mkdir -p bin
curl -fsSL "$release/horo_${HOROPTER_VERSION#v}_${platform}.tar.gz" | tar -xz -C bin horo

export HOROPTER_INGRESS_URL=http://localhost:8080
export HOROPTER_EGRESS_URL=http://localhost:8081
# The stack's two development keys, a producer's and a reader's.
producer=horo_dead00000001_00000000000000000000000000000000000000000000000000000000000000
reader=horo_dead00000002_11111111111111111111111111111111111111111111111111111111111111
export HOROPTER_INGRESS_KEY=$producer HOROPTER_EGRESS_KEY=$reader

wait_for() {
  for _ in $(seq 90); do
    curl -fsS "$1" > /dev/null 2>&1 && return
    sleep 2
  done
  echo "$1 did not answer within 180s" >&2
  return 1
}

wait_for "$HOROPTER_INGRESS_URL/readyz"

# Two regions: the page's Verification query selects namespace demo, so it must return the
# first and not the second.
bin/horo run --type deployment --subject HelmRelease/demo/app --title "Upgrade demo app" -- sleep 2
bin/horo run --type deployment --subject HelmRelease/other/app --title "Upgrade other app" \
  -- sleep 2

# The environment is the page's manual step, set here because Grafana reads it only at start.
# The provisioning directory starts empty: the page's steps write it.
mkdir -p provisioning/datasources provisioning/dashboards
docker run --detach --quiet --name "$project-grafana" --network "${project}_default" \
  --publish 127.0.0.1:3000:3000 \
  --env GF_PLUGINS_PREINSTALL_SYNC="yesoreyeram-infinity-datasource@$INFINITY_VERSION" \
  --env HOROPTER_READER_KEY="$HOROPTER_EGRESS_KEY" \
  --volume "$PWD/provisioning:/etc/grafana/provisioning" \
  "grafana/grafana:$GRAFANA_VERSION" > /dev/null

export GRAFANA_URL=http://localhost:3000
export GRAFANA_AUTH=admin:admin
export GRAFANA_PROVISIONING=$PWD/provisioning
# Grafana's container reaches egress by its Compose service name, not by the loopback port the
# steps' shell uses.
export GRAFANA_EGRESS_URL=http://egress:8081

wait_for "$GRAFANA_URL/api/health"
curl -fsS -u "$GRAFANA_AUTH" "$GRAFANA_URL/api/plugins/yesoreyeram-infinity-datasource/settings" \
  | jq -e --arg version "$INFINITY_VERSION" '.info.version == $version' > /dev/null
