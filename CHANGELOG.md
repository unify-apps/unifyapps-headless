# Changelog

Notable changes to UnifyApps Headless.

## Unreleased

- Security: the auto-mode allow rule for `run-node.sh` now names a plugin
  script. The old rule let the launcher run any arguments, so
  `run-node.sh -e "<code>"` ran without a prompt. Run the permissions command
  once more (`/ua:setup` names it when it is needed): it adds the new rule and
  takes the old one out.
- Security: a builder's Read and Grep can no longer reach the person's saved
  sign-in (the cookie folder and the signed-in browser profile) or SSH and cloud
  keys. Before, only its Bash was kept out.
- Releases: the tests and the Claude Code CLI (now pinned) run in a job that
  never sees the release deploy key; the keyed job only commits, tags and pushes
  the commit that job tested.

- A solution works in one tenant workspace. Setup asks for the workspace once,
  after the tenant: one workspace beside Global is taken without asking, several
  are offered, and Global is the default and what every existing folder reads
  as. Everything the folder builds lands in that workspace, its links open
  `/p/<workspace>/…`, and a write or a link on an item in another workspace — or
  on one that belongs to no workspace — is refused with `WORKSPACE_MISMATCH`
  before anything is sent. A solution in no workspace works on everything,
  because Global is the view without a workspace. Reads are never refused.
- New: `workspace list` and `workspace show`, and `solution create --workspace`.
  `solution context` and `solution open` name the workspace they work in.
- A create that cannot say which workspace its asset belongs to (an AI agent, a
  context graph, a connection, the evaluation and test creates, a connector, an
  API policy) is refused up front in a workspace solution, naming the tool,
  rather than stranding the asset in Global where that folder could never
  change it again.
- Because a tenant write that carries no workspace header moves the item to
  Global, every placement is read back and repaired rather than trusted: the
  solution record after a record write, and an app, object or automation after a
  create or an edit. Each entity goes back to its own workspace, so a Global
  folder's edit never re-homes another workspace's app.
- Rename, no behaviour change: the local folder is a folder, so the platform's
  workspace can keep the word. `scripts/workspace/` is `scripts/folder/`, and
  `WORKSPACE_CONTENT_CONFLICT` and `WORKSPACE_SOLUTION_MISMATCH` are `FOLDER_*`.
- The plugin's hooks now run on Codex. A Codex install writes them as
  `[[hooks.<Event>]]` blocks into Codex's own `config.toml`, between markers, so
  everything else in that file stays as the person left it, and Codex asks once
  to trust them. A plugin cannot carry hooks — `codex features list` reports
  `plugin_hooks` as removed — and a `hooks/hooks.json` in the Codex home or in a
  project is not read: measured on codex-cli 0.170.0, a hook in either file never
  ran. Six events are registered: `PreToolUse` (the builder guard),
  `PostToolUse`, `SessionStart` (the solution sync, the session snapshot and the
  resume recovery line), `PreCompact`, `PermissionRequest` (where Claude Code
  raises `Notification`) and `SubagentStop`, which is how a Codex session learns
  a builder finished, in place of Claude Code's agent notifications.
- `scripts/codex-hooks.mjs`, one entry point for every Codex hook event, and
  `scripts/codex/host-events.mjs`, which translates a Codex payload into the
  shape the plugin's existing hook code reads. Codex sends the same field names
  and takes the same answer envelope as Claude Code, so no hook logic is
  duplicated, and it names a tool to a hook the way Claude Code does: a shell
  call arrives as `Bash` with `tool_input.command`. The adapter still maps
  Codex's own names — `apply_patch` becomes one write per file in the patch,
  because the guard decides per file, and `shell` and `unified_exec` become
  `Bash` — for the calls that arrive under them. It also narrows each answer to
  what Codex accepts for that event: a `PreToolUse` hook there may refuse but
  may not approve, and Codex drops a whole answer that holds something the event
  disallows, the refusal with it.
- A builder agent was not held to its own folder on Codex. The guard recognised
  only the Claude Code spelling of a builder's name (`ua:fde-agent`), while a
  Codex agent is installed as `ua_fde_agent`, because a Codex agent name takes
  neither a colon nor a hyphen. Every builder passed the guard unjailed. Names
  are canonicalised before the guard reads them now: in `denyReason`, in the
  approvals gate, in the design-capture write root, and in the fail-closed branch
  that runs when a payload cannot be parsed at all.

## 0.0.9

Maintenance release.

## 0.0.8

- A required update takes effect within an hour of its release: the release
  check is cached for one hour, not six.
- GitHub Copilot CLI reads its own catalogue and manifest
  (`.github/plugin/marketplace.json`, `.github/plugin/plugin.json`) instead of
  falling back to the Claude Code ones. Each release writes both from the
  Claude files, so they always name the same version and tag.
- Antigravity: `agy plugin install https://github.com/unify-apps/unifyapps-headless/tree/<release>`
  installs a release with its own manifest (`.antigravity-plugin/plugin.json`
  and `mcp_config.json`): every skill, the builders and the tenant servers.
  Each release writes the newest tag into the README command, and the update
  notice names it.
- Builders list their `tools` and `disallowedTools` as YAML lists, which
  Claude Code and Antigravity both read.

## 0.0.7

- OpenCode update: OpenCode keeps the downloaded copy of a GitHub plugin and
  its `plugin update` refreshes only npm packages, so the update command now
  removes the plugin, deletes that copy and adds the newest release. The update
  notice gives the same command.

## 0.0.6

Maintenance release.

## 0.0.5

- Releases: a merge to `main` publishes nothing. A person publishes a version
  from the publish workflow; every agent installs the newest release, never
  work in progress. See RELEASING.md.
- Required updates: a release can require every older copy to update. Until
  it does, the session start says how, and tenant tools refuse every call.
  A newer optional release is mentioned once.
- Betas: published as pre-releases, installed only by naming their tag.
- Codex installs with its own plugin commands
  (`codex plugin marketplace add unify-apps/unifyapps-headless`), with no
  installer script.
- OpenCode installs the newest release with
  `opencode plugin add 'github:unify-apps/unifyapps-headless#semver:*'`.
- The installer script installs the Latest release, not `main`, and no longer
  keeps every version it ever staged.

## 0.0.4

- OpenCode 2: `opencode plugin add github:unify-apps/unifyapps-headless` now
  installs and loads. The plugin uses OpenCode 2's plugin API and gives it what
  it gave OpenCode 1: the tenant MCP servers, the builder agents held to their
  own servers, every skill, the `/ua:` commands, the plugin folder in every
  shell command, and a "Yes" to a delete question approving that delete.
  OpenCode 1 (1.18.29 and later) keeps working from the same package.
- The installer's OpenCode loader works on OpenCode 1 and 2.
- `/ua:` command descriptions in OpenCode and Gemini CLI no longer start with a
  stray quote mark.

## 0.0.3

- Sign-in opens one link, the tenant's sign-in page, which returns to the
  plugin once the person signs in. No 401 page and no second tab. The agent
  shows the link in chat so it can be pasted when no tab opens.

## 0.0.1

First public release.

### What it does

- Builds UnifyApps solutions from chat: objects and records, automations, web
  and mobile app pages, AI agents, Code Builder apps, context graphs, UI tests
  and changesets. Every write is read back from the platform before it is
  called done.
- Twelve builder agents (app, automation, FDE, agent builder, code app, graph,
  test author and reviewers) work in parallel on a plan; `/ua:plan` shows the
  plan for approval first.
- Loops that run a piece of work end to end: build, fix, scope, test and review
  for web apps, mobile apps, automations and AI agents, plus content (decks,
  presentations and narrated videos).
- A delete always waits for the person's answer, in every agent.

### Install

- One installer for every coding agent on the machine: Claude Code, Codex,
  OpenCode, Gemini CLI and GitHub Copilot CLI. It asks which to install for,
  installs Node 22 when it is missing, and never uses `sudo`.
- Each agent's own install command works too, except Codex, which uses the
  installer.
- The installer adds the plugin to agents already installed; it never installs
  an agent. Updates are manual: run the install command again.

### Sign-in and privacy

- Sign-in goes through the person's own browser, with a Chrome window and a
  pasted cookie as fallbacks. `login.mjs <host> --logout` ends the session.
- The plugin talks only to the person's own tenant. It sends no telemetry, reads
  no device or AI-account identifiers, and files no reports on its own:
  `/ua:give-feedback` sends one only when the person runs it.

### License

- MIT (`LICENSE`).
