# shellcheck shell=bash disable=SC2154 # the harness exports the pins in versions
# Sourced by github-action.mdx's front matter, in the steps' shell: builds what a reader already
# has, a Horopter they can issue keys against holding one change that record-action recorded,
# and sets the variables the page's manual steps have a reader set.
set -euo pipefail

project=horopter-docs-github-action
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
PATH=$PWD/bin:$PATH

# The reader's horoctl reaches their database; this one reaches the stack's through its
# bootstrap service, which has DATABASE_URL set.
horoctl() {
  docker compose --project-name "$project" run --rm --no-deps -T bootstrap "$@"
}

export REPOSITORY=acme/api
export HOROPTER_INGRESS_URL=http://localhost:8080
export HOROPTER_EGRESS_URL=http://localhost:8081
TENANT_ID=$(horoctl admin tenant list | awk -F '\t' '$2 == "default" { print $1 }')
export TENANT_ID

wait_for() {
  for _ in $(seq 90); do
    curl -fsS "$1" > /dev/null 2>&1 && return
    sleep 2
  done
  echo "$1 did not answer within 180s" >&2
  return 1
}

wait_for "$HOROPTER_INGRESS_URL/readyz"

# What record-action runs for the page's deploy job on run 123's first attempt, posted with a
# key issued as the page issues its own.
action_key=$(horoctl admin keys issue --tenant "$TENANT_ID" --role producer \
  --source "github/$REPOSITORY" --locus github | grep -x 'horo_[0-9a-f_]*')
HOROPTER_INGRESS_KEY=$action_key horo run --type deployment --subject acme/prod \
  --ref "$REPOSITORY/123/1/deploy" --title "Deploy / deploy" --actor octocat \
  --attr sha=0123456789abcdef0123456789abcdef01234567 --attr git_ref=refs/heads/main \
  --attr workflow=Deploy --attr "run_url=https://github.com/$REPOSITORY/actions/runs/123/attempts/1" \
  -- true

export REF=github/$REPOSITORY/123/1/deploy
