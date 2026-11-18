# Install UnifyApps Headless

UnifyApps Headless installs into Claude Code, Codex, OpenCode, Gemini CLI and GitHub Copilot CLI. One installer finds which of them are on the machine, asks which ones to install for, and installs for each. To use each agent's own plugin command instead (`claude plugin install`, `opencode plugin`, `gemini extensions install`, `copilot plugin install`), see the [Install section of the README](./README.md#install).

1. Run the installer, either way:
   - from GitHub, signed in with `gh auth login`: `gh api -H 'Accept: application/vnd.github.raw' repos/unify-apps/unifyapps-headless/contents/install.sh | bash`
   - from a clone: `bash setup.sh` in that folder
2. Choose the agents when it asks (numbers, names, `all`, or Enter for every agent found). To skip the question, pass `--agents claude,codex,opencode,gemini,copilot` or `--yes`.
3. Exit any running session of those agents and start a new one.
4. Type `/ua:setup` (in Codex, `$ua:setup`; in Copilot CLI there are no slash commands, so ask for the work in words), alone or followed by what you want to do. It checks the UnifyApps Headless version first, then asks the tenant, signs you in and opens or creates a solution. When it is done it goes straight on with what you asked. In a folder that is already set up, it checks the sign-in, the guide, the sync and the tenant tools, and fixes only what is broken.

`setup.sh` installs a private Node 22 under `UA_HOME/runtime` (default `~/.unifyapps-solutions/runtime`) when Node 22+ is missing, then stages one copy of UnifyApps Headless under `UA_HOME/plugin/<version>` and points every chosen agent at it. It adds the plugin only to coding agents already installed; it never installs an agent. Setup does not use sudo or edit a shell profile. `bash setup.sh --check` (or `--list`) says which agents are here; `--uninstall` removes the plugin from the agents you choose.

| Agent | What is installed |
|---|---|
| Claude Code | the `ua@unifyapps-headless` plugin at user scope |
| Codex | the `ua@unifyapps-headless` Codex plugin, and the builders in `~/.codex/agents/ua-*.toml` |
| OpenCode | `~/.config/opencode/plugins/unifyapps-headless.js`, which loads the staged copy |
| Gemini CLI | the `unifyapps-headless` extension in `~/.gemini/extensions/` |
| Copilot CLI | the staged copy as a local marketplace, with `ua@unifyapps-headless` installed live from it |

To update, run the installer again, then restart your agents. UnifyApps Headless never updates itself; `--update` reinstalls into the agents the last install chose (they are listed in `UA_HOME/agents.json`). Persistent cookies and solution cache remain under `UA_HOME`; the plugin copy is separate.

A Claude session that starts in a solution folder syncs the folder in the background and records the result in `.nebula/sync.json`. Restart your agent after a reinstall so the new skills, hooks and MCP servers load.

For a local checkout with runtimes already available, run `node scripts/install-local.mjs`. For release validation from the checkout, run `npm test`, `npm run validate`, and `npm run package:zip`. The ZIP contains the plugin manifest, the MCP server launchers, skills, agents, hooks and scripts. Local tenant data and generated folders are excluded.
