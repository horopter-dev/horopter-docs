# shellcheck shell=bash disable=SC2154 # the harness exports the pins in versions
# Sourced by flux.mdx's front matter, in the steps' shell: builds what a reader already has, a
# cluster running Flux with a Git source applied and Horopter installed as Install Horopter in
# Kubernetes installs it, and sets the values the page's manual steps have a reader set.
set -euo pipefail

cluster=horopter-docs-flux
release=https://github.com/horopter-dev/horopter/releases/download/$HOROPTER_VERSION

mise install --quiet "kind@$KIND_VERSION" "helm@$HELM_VERSION" \
  "kubectl@${KUBERNETES_VERSION#v}" "flux2@$FLUX_VERSION"
PATH="$(mise bin-paths "kind@$KIND_VERSION" "helm@$HELM_VERSION" \
  "kubectl@${KUBERNETES_VERSION#v}" "flux2@$FLUX_VERSION" | paste -sd: -):$PATH"
export PATH

for chart in "horopter:$HOROPTER_CHART_VERSION" "horopter-flux:$HOROPTER_FLUX_CHART_VERSION"; do
  app_version=$(helm show chart "oci://ghcr.io/horopter-dev/charts/${chart%%:*}" \
    --version "${chart#*:}" | sed -n 's/^appVersion: *"*\([^"]*\)"*$/\1/p')
  if [[ $app_version != "$HOROPTER_VERSION" ]]; then
    echo "chart $chart installs Horopter $app_version, but the page states" \
      "HOROPTER_VERSION=$HOROPTER_VERSION; move the pins in versions together" >&2
    exit 1
  fi
done

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

kind create cluster --name "$cluster" --image "kindest/node:$KUBERNETES_VERSION" --wait 120s

# Horopter's images and charts are private until Go public. The images are pulled here with the
# runner's login and loaded into the node, where IfNotPresent finds them, as the install
# how-to's setup does. Delete this at Go public (HOR-15).
node_platform=$(docker version --format '{{.Server.Os}}/{{.Server.Arch}}')
for image in horopter-ingress horopter-egress horopter-migrate horoctl horopter-flux; do
  docker pull --quiet --platform "$node_platform" "ghcr.io/horopter-dev/$image:$HOROPTER_VERSION"
  docker save --platform "$node_platform" "ghcr.io/horopter-dev/$image:$HOROPTER_VERSION" \
    | kind load image-archive --name "$cluster" /dev/stdin
done

flux install --version "v$FLUX_VERSION"

# source-controller pulls the horopter-flux chart itself, so while it is private the page's
# HelmRepository needs the runner's login as a pull Secret. The page's YAML names none, so this
# adds it to the HelmRepository once the page creates it. Delete this at Go public (HOR-15).
ghcr_login() {
  local config=${DOCKER_CONFIG:-$HOME/.docker}/config.json helper auth
  auth=$(jq -r '.auths["ghcr.io"].auth // empty' "$config")
  if [[ -n $auth ]]; then
    base64 --decode <<< "$auth"
    return
  fi
  helper=$(jq -r '.credHelpers["ghcr.io"] // .credsStore // empty' "$config")
  "docker-credential-$helper" get <<< ghcr.io | jq -r '.Username + ":" + .Secret'
}
login=$(ghcr_login)
kubectl create secret docker-registry ghcr-pull --namespace flux-system \
  --docker-server ghcr.io --docker-username "${login%%:*}" --docker-password "${login#*:}"
(
  until kubectl patch helmrepository horopter --namespace flux-system --type merge \
    --patch '{"spec":{"secretRef":{"name":"ghcr-pull"}}}' 2> /dev/null; do
    sleep 1
  done
) > helmrepository-patch.log 2>&1 &
echo "$!" > helmrepository-patch.pid

# Horopter, as Install Horopter in Kubernetes installs it, with that page's names.
export HOROPTER_NAMESPACE=horopter
export HOROPTER_RELEASE=horopter
export HOROPTER_DATABASE_SECRET=horopter-db-app
cnpg=https://github.com/cloudnative-pg/cloudnative-pg/releases/download/v$CNPG_VERSION
kubectl apply --server-side -f "$cnpg/cnpg-$CNPG_VERSION.yaml"
kubectl rollout status deployment/cnpg-controller-manager --namespace cnpg-system --timeout 240s
kubectl create namespace "$HOROPTER_NAMESPACE"
kubectl apply --namespace "$HOROPTER_NAMESPACE" -f - << EOF
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: horopter-db
spec:
  instances: 1
  storage:
    size: 1Gi
EOF
kubectl wait cluster horopter-db --namespace "$HOROPTER_NAMESPACE" \
  --for condition=Ready --timeout 240s
helm install "$HOROPTER_RELEASE" oci://ghcr.io/horopter-dev/charts/horopter \
  --version "$HOROPTER_CHART_VERSION" --namespace "$HOROPTER_NAMESPACE" \
  --set database.existingSecret="$HOROPTER_DATABASE_SECRET" --wait

# The page runs horoctl through the install how-to's in_cluster and horoctl functions, which a
# reader defined there. They are read from that page, so CI runs the functions it shows.
install_page=$DOCS_ROOT/content/docs/how-to/install-kubernetes.mdx
# shellcheck source=/dev/null
source <(sed -n '/^in_cluster() {$/,/^```$/p' "$install_page" | sed '$d')
TENANT_ID=$(horoctl admin tenant create --display-name acme | grep -x 'tnt_[0-9a-f]*')
export TENANT_ID

# A Git source the cluster already applies, so a commit change exists before the client starts.
kubectl apply -f - << EOF
apiVersion: source.toolkit.fluxcd.io/v1
kind: GitRepository
metadata:
  name: podinfo
  namespace: flux-system
spec:
  interval: 1h
  url: https://github.com/stefanprodan/podinfo
  ref:
    tag: "$PODINFO_TAG"
---
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: podinfo
  namespace: flux-system
spec:
  interval: 1h
  path: ./kustomize
  prune: true
  targetNamespace: default
  sourceRef:
    kind: GitRepository
    name: podinfo
EOF
kubectl wait kustomization podinfo --namespace flux-system --for condition=Ready --timeout 180s

export CLUSTER=docs
export HOROPTER_INGRESS_URL=http://horopter-ingress.horopter.svc:8080
export HOROPTER_EGRESS_URL=http://localhost:18082

# A port-forward ends with the pod it reached, so this retries until cleanup stops it.
(
  while true; do
    kubectl port-forward --namespace horopter service/horopter-egress 18082:8081 || true
    sleep 2
  done
) > port-forward.log 2>&1 &
echo "$!" > port-forward.pid
