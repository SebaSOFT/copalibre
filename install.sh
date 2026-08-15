#!/usr/bin/env bash
# Installs the standalone `copalibre` CLI binary — no Node.js, no checkout.
#
#   curl -fsSL https://raw.githubusercontent.com/SebaSOFT/copalibre/main/install.sh | bash
#
# OS/arch detection (including the macOS Rosetta case) is informed by, not
# copied from, usestrix/strix's own publicly-available install script,
# adapted to this project's release-asset naming — a bare binary per target,
# not an archive, since copalibre-cli-release.yml uploads
# `copalibre-<target>` directly.
set -euo pipefail

REPO="SebaSOFT/copalibre"
INSTALL_DIR="$HOME/.copalibre/bin"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
MUTED='\033[0;2m'
NC='\033[0m'

print_message() {
  local level=$1 message=$2 color=""
  case "$level" in
    info) color="$NC" ;;
    success) color="$GREEN" ;;
    warning) color="$YELLOW" ;;
    error) color="$RED" ;;
  esac
  echo -e "${color}${message}${NC}"
}

raw_os=$(uname -s)
case "$raw_os" in
  Darwin*) os="macos" ;;
  Linux*) os="linux" ;;
  MINGW*|MSYS*|CYGWIN*) os="windows" ;;
  *)
    print_message error "Unsupported OS: $raw_os"
    exit 1
    ;;
esac

arch=$(uname -m)
case "$arch" in
  aarch64|arm64) arch="arm64" ;;
  x86_64|amd64) arch="x86_64" ;;
  *)
    print_message error "Unsupported architecture: $arch"
    exit 1
    ;;
esac

# Rosetta reports x86_64 for `uname -m` on Apple Silicon — the real arm64
# binary is the correct, faster choice whenever it's available.
if [ "$os" = "macos" ] && [ "$arch" = "x86_64" ]; then
  if [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" = "1" ]; then
    arch="arm64"
  fi
fi

target="$os-$arch"
case "$target" in
  linux-x86_64|linux-arm64|macos-x86_64|macos-arm64|windows-x86_64) ;;
  *)
    print_message error "Unsupported OS/arch combination: $target"
    exit 1
    ;;
esac

asset="copalibre-$target"
binary_name="copalibre"
if [ "$os" = "windows" ]; then
  asset="$asset.exe"
  binary_name="copalibre.exe"
fi

requested_version=${VERSION:-}
if [ -z "$requested_version" ]; then
  version=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
    | sed -n 's/.*"tag_name": *"v\([^"]*\)".*/\1/p')
  if [ -z "$version" ]; then
    print_message error "Failed to determine the latest copalibre release"
    exit 1
  fi
else
  version=$requested_version
fi

mkdir -p "$INSTALL_DIR"
installed_binary="$INSTALL_DIR/$binary_name"

if [ -x "$installed_binary" ]; then
  installed_version=$("$installed_binary" --version 2>/dev/null || echo "")
  if [ "$installed_version" = "$version" ]; then
    print_message success "✓ copalibre $version already installed at $INSTALL_DIR"
    skip_download=true
  else
    print_message info "${MUTED}Installed: ${NC}${installed_version:-none} ${MUTED}→ installing ${NC}$version"
    skip_download=false
  fi
else
  skip_download=false
fi

if [ "$skip_download" != "true" ]; then
  url="https://github.com/$REPO/releases/download/v$version/$asset"
  print_message info "${MUTED}Downloading copalibre ${NC}$version ${MUTED}for ${NC}$target${MUTED}...${NC}"

  tmp_file=$(mktemp)
  trap 'rm -f "$tmp_file"' EXIT
  if ! curl -fsSL -o "$tmp_file" "$url"; then
    print_message error "Download failed: $url"
    exit 1
  fi

  mv "$tmp_file" "$installed_binary"
  chmod 755 "$installed_binary"
  trap - EXIT
  print_message success "✓ copalibre $version installed to $installed_binary"
fi

add_to_path() {
  local config_file=$1 line=$2
  if grep -Fxq "$line" "$config_file" 2>/dev/null; then
    print_message info "${MUTED}PATH already configured in ${NC}$config_file"
  elif [ -w "$config_file" ]; then
    printf '\n# copalibre\n%s\n' "$line" >> "$config_file"
    print_message info "${MUTED}Added copalibre to \$PATH in ${NC}$config_file"
  else
    print_message warning "Manually add the install directory to your shell's startup file:"
    print_message info "  $line"
  fi
}

setup_path() {
  if [[ ":$PATH:" == *":$INSTALL_DIR:"* ]]; then
    return
  fi

  current_shell=$(basename "${SHELL:-sh}")
  case "$current_shell" in
    fish) config_files="$HOME/.config/fish/config.fish" ;;
    zsh) config_files="${ZDOTDIR:-$HOME}/.zshrc" ;;
    bash) config_files="$HOME/.bashrc $HOME/.bash_profile $HOME/.profile" ;;
    *) config_files="$HOME/.profile" ;;
  esac

  config_file=""
  for candidate in $config_files; do
    if [ -f "$candidate" ]; then
      config_file=$candidate
      break
    fi
  done

  if [ -z "$config_file" ]; then
    print_message warning "Add the install directory to your PATH:"
    print_message info "  export PATH=\"$INSTALL_DIR:\$PATH\""
    return
  fi

  if [ "$current_shell" = "fish" ]; then
    add_to_path "$config_file" "fish_add_path $INSTALL_DIR"
  else
    add_to_path "$config_file" "export PATH=\"$INSTALL_DIR:\$PATH\""
  fi
}

if [ "$os" != "windows" ]; then
  setup_path
fi

echo ""
print_message success "copalibre is ready."
echo ""
echo -e "${MUTED}To get started:${NC}"
echo -e "  ${MUTED}mkdir my-tournament && cd my-tournament${NC}"
echo -e "  ${MUTED}$INSTALL_DIR/copalibre init${NC}"
echo ""
if [ "$os" != "windows" ]; then
  echo -e "${YELLOW}→${NC} Open a new terminal (or re-source your shell's startup file) to use ${MUTED}copalibre${NC} directly."
fi
