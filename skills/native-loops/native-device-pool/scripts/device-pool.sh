#!/usr/bin/env bash
# Launcher for device-pool.mjs: finds a Node 22+ even when the calling shell has
# none on PATH (a hook runs with Claude Code's environment, not the user's).
# In hook mode it never fails the tool call: no node, or a crash, exits 0.
# The hooks run in every UnifyApps Headless session, mobile or not, so a machine without a
# simulator pool leaves here before node starts, without creating a file.
set -u
# Resolve symlinks (a linked skill folder under ~/.claude/skills, or a linked script) to the real folder.
SOURCE="${BASH_SOURCE[0]}"
while [ -L "$SOURCE" ]; do
  LINK_DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  case "$SOURCE" in /*) ;; *) SOURCE="$LINK_DIR/$SOURCE" ;; esac
done
DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
LOOPS_HOME_DIR="${LOOPS_HOME:-${UA_HOME:-$HOME/.unifyapps-solutions}/loops}"
LEGACY_HOME_DIR="$HOME/.agentic-loops"

# A pool exists, or a legacy pool waits to be moved (device-pool.mjs moves it once).
has_pool() {
  [ -f "$LOOPS_HOME_DIR/pool.json" ] && return 0
  [ -z "${LOOPS_HOME:-}" ] && [ ! -e "$LOOPS_HOME_DIR" ] && [ -f "$LEGACY_HOME_DIR/pool.json" ] && return 0
  return 1
}

# Fast paths: no node start and no file written unless there is work.
if [ "${1:-}" = "hook" ]; then
  has_pool || exit 0
  if [ "${2:-}" = "pretool-bash" ]; then
    HOOK_INPUT="$(cat)"
    case "$HOOK_INPUT" in
      *argent*) ;;
      *) exit 0 ;;
    esac
  fi
fi

find_node() {
  if [ -n "${LOOPS_NODE:-}" ] && [ -x "$LOOPS_NODE" ]; then
    echo "$LOOPS_NODE"
    return
  fi
  # config.nodeBin is a bin folder; read it without node (one line of JSON).
  if [ -f "$LOOPS_HOME_DIR/config.json" ]; then
    local bin
    bin=$(sed -n 's/^[[:space:]]*"nodeBin":[[:space:]]*"\([^"]*\)".*$/\1/p' "$LOOPS_HOME_DIR/config.json" | head -1)
    if [ -n "$bin" ] && [ -x "$bin/node" ]; then
      echo "$bin/node"
      return
    fi
  fi
  if command -v node >/dev/null 2>&1; then
    command -v node
    return
  fi
  local candidate
  for candidate in "$HOME"/.nvm/versions/node/v2[2-9]*/bin/node "$HOME"/.nvm/versions/node/v[3-9]*/bin/node /opt/homebrew/bin/node /usr/local/bin/node; do
    if [ -x "$candidate" ]; then
      echo "$candidate"
      return
    fi
  done
}

NODE="$(find_node)"

if [ "${1:-}" = "hook" ]; then
  [ -z "$NODE" ] && exit 0
  ERR_LOG=/dev/null
  [ -d "$LOOPS_HOME_DIR/logs" ] && ERR_LOG="$LOOPS_HOME_DIR/logs/hooks.err"
  if [ "${2:-}" = "pretool-bash" ]; then
    printf '%s' "$HOOK_INPUT" | "$NODE" "$DIR/device-pool.mjs" "$@" 2>>"$ERR_LOG"
  else
    "$NODE" "$DIR/device-pool.mjs" "$@" 2>>"$ERR_LOG"
  fi
  exit 0
fi

if [ -z "$NODE" ]; then
  echo "device-pool: no node 22+ found. Set LOOPS_NODE=/path/to/node or config.nodeBin=/path/to/bin" >&2
  exit 1
fi
exec "$NODE" "$DIR/device-pool.mjs" "$@"
