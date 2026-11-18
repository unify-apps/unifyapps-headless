#!/usr/bin/env bash
# Unzip, then: bash setup.sh. No Homebrew, sudo, or separate runtime setup.
#
#   bash setup.sh                       find the coding agents here, ask which to install for
#   bash setup.sh --agents codex,opencode
#   bash setup.sh --yes                 every agent found, no question
#   bash setup.sh --list                which agents are here
#   bash setup.sh --uninstall [--agents …]
#   bash setup.sh --check               is Node ready, and is the plugin installed in each agent
#   bash setup.sh --permissions         only Claude Code's auto-mode rules
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/scripts/runtime.sh"
CHECK=false
case "${1:-}" in
  --check) CHECK=true ;;
  # Only the permission rules, for a person who installed before setup wrote them.
  --permissions) exec bash "$HERE/scripts/run-node.sh" "$HERE/scripts/permissions.mjs" apply ;;
esac
have() { command -v "$1" >/dev/null 2>&1; }
ok() { printf '  OK  %s\n' "$*"; }
fail() { printf '  ERROR  %s\n' "$*" >&2; exit 1; }
node_ready() { have node && have npm && node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' >/dev/null 2>&1; }
download() { curl --fail --location --silent --show-error --retry 2 --connect-timeout 20 --max-time 600 "$1" -o "$2"; }

echo "UnifyApps Headless setup"
if $CHECK; then
  if node_ready; then ok "Node $(node --version)"; else echo '  Missing: Node >= 22 with npm'; exit 1; fi
  exec node "$HERE/scripts/install/index.mjs" --list
fi

case "$(uname -s)" in Darwin) platform=darwin ;; Linux) platform=linux ;; *) fail 'This ZIP supports macOS and Linux.' ;; esac
case "$(uname -m)" in arm64|aarch64) arch=arm64 ;; x86_64|amd64) arch=x64 ;; *) fail 'This ZIP supports Intel/AMD 64-bit and ARM64 machines.' ;; esac
have curl || fail 'curl is unavailable on this machine.'
scratch="$(mktemp -d "${TMPDIR:-/tmp}/ua-setup.XXXXXX")"
trap 'rm -rf "$scratch"' EXIT

# Official Node binaries include npm. Install locally only when a runtime is missing.
if ! node_ready; then
  echo '  Installing Node automatically…'
  base='https://nodejs.org/dist/latest-v22.x'
  download "$base/SHASUMS256.txt" "$scratch/SHASUMS256.txt"
  asset="$(awk -v suffix="-$platform-$arch.tar.gz" 'length($2) >= length(suffix) && substr($2,length($2)-length(suffix)+1) == suffix {print $2; exit}' "$scratch/SHASUMS256.txt")"
  [[ "$asset" =~ ^node-v22\.[0-9]+\.[0-9]+-(darwin|linux)-(arm64|x64)\.tar\.gz$ ]] || fail 'Could not resolve the official Node download.'
  download "$base/$asset" "$scratch/$asset"
  expected="$(awk -v asset="$asset" '$2 == asset {print $1}' "$scratch/SHASUMS256.txt")"
  if have shasum; then actual="$(shasum -a 256 "$scratch/$asset" | awk '{print $1}')"
  elif have sha256sum; then actual="$(sha256sum "$scratch/$asset" | awk '{print $1}')"
  else fail 'No SHA-256 utility is available to verify Node.'; fi
  [[ "$actual" == "$expected" ]] || fail 'Node download failed its checksum; rerun setup.'
  mkdir -p "$UA_RUNTIME_HOME/node"
  tar -xzf "$scratch/$asset" -C "$UA_RUNTIME_HOME/node" --strip-components=1
  hash -r
  node_ready || fail 'The downloaded Node runtime cannot run on this OS.'
fi
ok "Node $(node --version)"

# Which agents, and installing into each, is the installer's job.
node "$HERE/scripts/install/index.mjs" "$@"
