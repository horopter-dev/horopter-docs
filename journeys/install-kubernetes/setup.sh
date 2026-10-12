# shellcheck shell=bash disable=SC2154 # the harness exports the pins in versions
# Sourced by install-kubernetes.mdx's front matter, in the steps' shell: builds what a reader
# already has, a cluster with kubectl and helm, and sets the two URLs the page's manual steps
# have a reader set.
set -euo pipefail

cluster=horopter-docs-install-kubernetes

mise install --quiet "kind@$KIND_VERSION" "helm@$HELM_VERSION" "kubectl@${KUBERNETES_VERSION#v}"
PATH="$(mise bin-paths "kind@$KIND_VERSION" "helm@$HELM_VERSION" "kubectl@${KUBERNETES_VERSION#v}" \
  | paste -sd: -):$PATH"
export PATH

app_version=$(helm show chart oci://ghcr.io/horopter-dev/charts/horopter \
  --version "$HOROPTER_CHART_VERSION" | sed -n 's/^appVersion: *"*\([^"]*\)"*$/\1/p')
if [[ $app_version != "$HOROPTER_VERSION" ]]; then
  echo "chart $HOROPTER_CHART_VERSION installs Horopter $app_version, but the page states" \
    "HOROPTER_VERSION=$HOROPTER_VERSION; move both pins in versions together" >&2
  exit 1
fi

kind create cluster --name "$cluster" --image "kindest/node:$KUBERNETES_VERSION" --wait 120s

# Horopter's images are private until Go public, and no step names a pull Secret, so the
# chart's images and horoctl's are pulled here with the runner's login and loaded into the
# node, where IfNotPresent finds them. Delete this at Go public (HOR-15).
# kind load docker-image imports every platform of an image index, which Docker's containerd
# store holds only one of, so this saves the node's platform alone.
platform=$(docker version --format '{{.Server.Os}}/{{.Server.Arch}}')
for image in horopter-ingress horopter-egress horopter-migrate horoctl; do
  docker pull --quiet --platform "$platform" "ghcr.io/horopter-dev/$image:$app_version"
  docker save --platform "$platform" "ghcr.io/horopter-dev/$image:$app_version" \
    | kind load image-archive --name "$cluster" /dev/stdin
done

# The page's default names: namespace and release both horopter.
export HOROPTER_INGRESS_URL=http://horopter-ingress.horopter.svc:8080
export HOROPTER_EGRESS_URL=http://localhost:18081

# The Service exists only once the page installs the chart, and a port-forward ends with the
# pod it reached, so this retries until cleanup stops it.
(
  while true; do
    kubectl port-forward --namespace horopter service/horopter-egress 18081:8081 || true
    sleep 2
  done
) > port-forward.log 2>&1 &
echo "$!" > port-forward.pid
