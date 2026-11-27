#!/usr/bin/env bash
# Installs the pinned gitleaks release for the security gate's history scan.
# The archive is checked against the SHA-256 recorded here before anything in
# it runs; a mismatch stops the job. Update VERSION and SHA256 together.
set -euo pipefail

VERSION=8.30.1
SHA256=551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb
ARCHIVE="gitleaks_${VERSION}_linux_x64.tar.gz"
DEST="${1:-$HOME/.local/bin}"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
curl --fail --silent --show-error --location --output "$work/$ARCHIVE" \
  "https://github.com/gitleaks/gitleaks/releases/download/v${VERSION}/${ARCHIVE}"
echo "${SHA256}  $work/$ARCHIVE" | sha256sum --check --strict -
tar -xzf "$work/$ARCHIVE" -C "$work" gitleaks
mkdir -p "$DEST"
install -m 0755 "$work/gitleaks" "$DEST/gitleaks"
"$DEST/gitleaks" version
