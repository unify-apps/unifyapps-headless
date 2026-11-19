#!/usr/bin/env bash
# Installs UnifyApps Headless from GitHub into the coding agents on this
# machine. It asks which ones; pass the same options as setup.sh to skip that:
#
#   curl -fsSL https://github.com/unify-apps/unifyapps-headless/releases/latest/download/install.sh | bash
#   curl -fsSL https://github.com/unify-apps/unifyapps-headless/releases/latest/download/install.sh | bash -s -- --agents codex,opencode
#
# It installs the Latest GitHub Release. UA_REF installs another tag, such as a
# beta (UA_REF=v0.0.6-beta.1), or a branch. The download signs in as you when
# it can (GH_TOKEN, GITHUB_TOKEN, or the GitHub CLI's sign-in), which a private
# copy of the repository needs; a public one downloads without it.
set -euo pipefail
REPO='unify-apps/unifyapps-headless'
REF="${UA_REF:-}"
fail() { printf 'UnifyApps Headless install: %s\n' "$*" >&2; exit 1; }
command -v curl >/dev/null 2>&1 || fail 'curl is not available on this machine.'
command -v unzip >/dev/null 2>&1 || fail 'unzip is not available on this machine.'

token="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
if [ -z "$token" ] && command -v gh >/dev/null 2>&1; then token="$(gh auth token --hostname github.com 2>/dev/null || true)"; fi

scratch="$(mktemp -d "${TMPDIR:-/tmp}/ua-install.XXXXXX")"
trap 'rm -rf "$scratch"' EXIT
auth=()
[ -z "$token" ] || auth=(-H "Authorization: Bearer $token")
if [ -z "$REF" ]; then
  REF="$(curl --fail --location --silent --show-error --retry 2 --connect-timeout 20 ${auth[@]+"${auth[@]}"} \
    -H 'Accept: application/vnd.github+json' "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null \
    | sed -n 's/^  "tag_name": "\(.*\)",$/\1/p' | head -n1)" || true
  [ -n "$REF" ] || fail "could not find the latest release of $REPO. Set UA_REF to a tag or branch to install that instead."
fi
echo "Downloading $REPO ($REF) from GitHub"
curl --fail --location --silent --show-error --retry 2 --connect-timeout 20 --max-time 600 \
  ${auth[@]+"${auth[@]}"} -H 'Accept: application/vnd.github+json' \
  "https://api.github.com/repos/$REPO/zipball/$REF" -o "$scratch/package.zip" \
  || fail "could not download $REPO ($REF). If the repository is private to you, sign in with \`gh auth login\` and run this again."
unzip -q "$scratch/package.zip" -d "$scratch/package"
# GitHub's archive puts the repository one folder down.
setup="$(find "$scratch/package" -maxdepth 2 -name setup.sh -type f | head -n1)"
[ -n "$setup" ] || fail "the download has no setup.sh; $REF is not a UnifyApps Headless branch or tag."
bash "$setup" "$@"
