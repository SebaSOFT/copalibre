#!/usr/bin/env bash
# Release candidate images: build once, scan those bytes, publish those bytes.
#
#   candidate-images.sh build   <out-dir>
#   candidate-images.sh scan    <out-dir>
#   candidate-images.sh publish <out-dir> <image-ref>...   (e.g. ghcr.io/sebasoft/copalibre:1.3.0)
#
# build writes one OCI archive per target (runtime, web) holding every
# platform in PLATFORMS, and <out-dir>/images.json with each archive's SHA-256
# and the digest of its image index. scan runs the pinned Trivy over every
# platform of every archive and fails on a fixable HIGH or CRITICAL
# vulnerability. publish pushes an archive unchanged with skopeo, then reads
# the registry's index back and refuses if its digest is not the one built and
# scanned. Nothing is rebuilt between the steps.
set -euo pipefail

PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"
TARGETS=(runtime web)

die() {
  echo "candidate-images: $*" >&2
  exit 1
}

index_digest() {
  # The image index is the archive's top-level index.json manifest entry.
  tar -xOf "$1" index.json | node -e '
    let raw = "";
    process.stdin.on("data", (chunk) => (raw += chunk)).on("end", () => {
      const index = JSON.parse(raw);
      const [entry, ...rest] = index.manifests ?? [];
      if (!entry || rest.length > 0) process.exit(2);
      process.stdout.write(entry.digest);
    });'
}

build() {
  local out="$1"
  mkdir -p "$out"
  local entries=()
  for target in "${TARGETS[@]}"; do
    # --pull: a cached base image would carry advisories its current tag has fixed.
    docker buildx build --pull --platform "$PLATFORMS" --target "$target" \
      --output "type=oci,dest=$out/$target.tar" .
    local sha digest
    sha=$(sha256sum "$out/$target.tar" | cut -d' ' -f1)
    digest=$(index_digest "$out/$target.tar") || die "$target.tar has no single image index"
    entries+=("{\"name\":\"$target\",\"file\":\"$target.tar\",\"sha256\":\"$sha\",\"indexDigest\":\"$digest\",\"platforms\":\"$PLATFORMS\"}")
  done
  local joined
  joined=$(IFS=,; echo "${entries[*]}")
  printf '{"revision":"%s","artifacts":[%s]}\n' "$(git rev-parse HEAD)" "$joined" >"$out/images.json"
  cat "$out/images.json"
}

artifact_field() {
  node -e '
    const [file, name, field] = process.argv.slice(1);
    const artifact = JSON.parse(require("node:fs").readFileSync(file, "utf8")).artifacts.find((a) => a.name === name);
    if (!artifact) process.exit(2);
    process.stdout.write(String(artifact[field]));' "$1" "$2" "$3"
}

verify_archive() {
  local out="$1" target="$2"
  local expected actual
  expected=$(artifact_field "$out/images.json" "$target" sha256) || die "$target is not in images.json"
  actual=$(sha256sum "$out/$target.tar" | cut -d' ' -f1)
  [ "$expected" = "$actual" ] || die "$target.tar changed after it was built (expected $expected, found $actual)"
}

scan() {
  local out="$1"
  command -v trivy >/dev/null || die "trivy is not on PATH; run scripts/security/install-trivy.sh"
  for target in "${TARGETS[@]}"; do
    verify_archive "$out" "$target"
    local layout="$out/$target-oci"
    rm -rf "$layout" && mkdir -p "$layout" && tar -xf "$out/$target.tar" -C "$layout"
    IFS=, read -ra platforms <<<"$PLATFORMS"
    for platform in "${platforms[@]}"; do
      echo "Scanning $target for $platform"
      trivy image --input "$layout" --platform "$platform" --scanners vuln \
        --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 --quiet \
        --ignorefile .trivyignore.yaml \
        --format json --output "$out/$target-${platform//\//-}.trivy.json"
    done
    rm -rf "$layout"
  done
  # Evidence for the security gate's release verdict (--runtime-evidence <out-dir>).
  node -e '
    const fs = require("node:fs");
    const [dir] = process.argv.slice(1);
    const images = JSON.parse(fs.readFileSync(`${dir}/images.json`, "utf8"));
    const file = `${dir}/runtime-evidence.json`;
    const evidence = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
    const record = {
      id: "candidate-image-scan",
      outcome: "pass",
      scanner: "trivy",
      revision: images.revision,
      artifacts: images.artifacts.map(({ name, indexDigest, platforms }) => ({ name, indexDigest, platforms })),
    };
    fs.writeFileSync(file, JSON.stringify([...evidence.filter((e) => e.id !== record.id), record], null, 2) + "\n");' "$out"
}

publish() {
  local out="$1"
  shift
  [ "$#" -gt 0 ] || die "publish needs at least one image reference"
  for ref in "$@"; do
    local target
    case "$ref" in
      */copalibre-web:*) target=web ;;
      */copalibre:*) target=runtime ;;
      *) die "cannot tell which archive $ref is" ;;
    esac
    verify_archive "$out" "$target"
    local digest pushed
    digest=$(artifact_field "$out/images.json" "$target" indexDigest)
    skopeo copy --all --preserve-digests "oci-archive:$out/$target.tar" "docker://$ref"
    pushed="sha256:$(skopeo inspect --raw "docker://$ref" | sha256sum | cut -d' ' -f1)"
    [ "$pushed" = "$digest" ] || die "$ref has index $pushed, but $digest was built and scanned"
    echo "Published $ref at $digest"
  done
}

command="${1:-}"
shift || true
case "$command" in
  build) build "$@" ;;
  scan) scan "$@" ;;
  publish) publish "$@" ;;
  *) die "usage: candidate-images.sh build|scan|publish <out-dir> [image-ref...]" ;;
esac
