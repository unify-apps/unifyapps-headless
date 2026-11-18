#!/usr/bin/env bash
# Starts the Playwright MCP server on a browser profile of its own.
#
# By default every server started from the same folder shares one on-disk Chrome
# profile, so a second Claude session fails with "Browser is already in use" and
# either waits or stops the first session's browser to take it. `--isolated` avoids
# the sharing, but on managed Macs (mandatory Chrome cloud enrollment) Chrome dies at
# launch in isolated mode. So each server gets its own on-disk profile, named after
# this shell's PID, which `exec` hands to the server.
#
# The browser is Playwright's Chrome for Testing (`--browser chromium`), never the
# person's own Chrome app. macOS treats every running copy of one app as that app: a
# link clicked in Slack, and a Dock click on Chrome, go to a running copy, so a copy
# of their Chrome that we start can take their links while their own is closed. It is
# installed by `node skills/app-verify/scripts/browser.mjs --install`, which the
# app-test-author skill runs before its first browser call: this server has no install
# tool. @playwright/mcp@0.0.82 and the wrapper's @playwright/cli@0.1.21 run the same
# playwright-core (1.64.0-alpha-1789764292000), so they open one installed browser;
# move the two versions together.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/runtime.sh"

idle_minutes=10
# The server closes its own browser after this long without a tool call; the next
# call reopens it on the same profile. An env var, not `--idle-timeout`, because an
# older @playwright/mcp refuses a flag it does not know but ignores the variable.
export PLAYWRIGHT_MCP_IDLE_TIMEOUT="${PLAYWRIGHT_MCP_IDLE_TIMEOUT:-$((idle_minutes * 60000))}"

# Per user, because /tmp is shared on Linux.
base="${TMPDIR:-/tmp}/ua-playwright-$(id -u)"
mkdir -p "$base"

# Cleans up after servers that have exited; a live server's profile and browser are
# never touched. A browser that outlived its server and has not written to its
# profile for $idle_minutes is stopped, as a fallback for the idle timeout above.
# A profile is deleted once nothing has it open. Without pgrep there is no safe way
# to tell, so nothing is stopped or deleted.
if command -v pgrep >/dev/null 2>&1; then
  for profile in "$base"/*/; do
    [ -d "$profile" ] || continue
    owner="$(basename "$profile")"
    kill -0 "$owner" 2>/dev/null && continue
    if [ -z "$(find "$profile" -mmin "-$idle_minutes" -print -quit 2>/dev/null)" ]; then
      pkill -u "$(id -u)" -f -- "--user-data-dir=$base/$owner( |$)" >/dev/null 2>&1 || true
    fi
    pgrep -f -- "$base/$owner( |$)" >/dev/null 2>&1 && continue
    rm -rf -- "${profile%/}" || true
  done
fi

exec npx @playwright/mcp@0.0.82 --user-data-dir "$base/$$" --browser chromium "$@"
