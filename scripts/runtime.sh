#!/usr/bin/env bash
# Shared by setup and MCP launchers, including hosts with a minimal PATH.
UA_RUNTIME_HOME="${UA_HOME:-$HOME/.unifyapps-solutions}/runtime"
export PATH="$UA_RUNTIME_HOME/node/bin:$UA_RUNTIME_HOME/claude/node_modules/.bin:$HOME/.local/bin:$PATH"
