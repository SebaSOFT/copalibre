#!/usr/bin/env bash
# Installs the pinned trivy release for scanning release candidate images.
# The archive is checked against the SHA-256 recorded here before anything in
# it runs; a mismatch stops the job. Update VERSION and SHA256 together.
set -euo pipefail

VERSION=0.76.1
SHA256=c7cbe3137fb8a48a17574bede3dd6beb16742d1e9772929940fc90082c39d9c0
ARCHIVE="trivy_${VERSION}_Linux-64bit.tar.gz"
DEST="${1:-$HOME/.local/bin}"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
curl --fail --silent --show-error --location --output "$work/$ARCHIVE" \
  "https://github.com/aquasecurity/trivy/releases/download/v${VERSION}/${ARCHIVE}"
echo "${SHA256}  $work/$ARCHIVE" | sha256sum --check --strict -
tar -xzf "$work/$ARCHIVE" -C "$work" trivy
mkdir -p "$DEST"
install -m 0755 "$work/trivy" "$DEST/trivy"
"$DEST/trivy" --version
