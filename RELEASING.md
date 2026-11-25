# Releasing

One branch, `main`, and one tag per published version. A merge to `main` publishes nothing: people install releases, never work in progress.

## Publish a version

Actions, **publish**, Run workflow, on `main`:

| Input | What it does |
|---|---|
| `channel: stable` | The next patch (0.0.5 to 0.0.6), marked Latest. Everyone gets it on their next install or update. |
| `channel: beta` | The next patch's next `-beta.N`, as a pre-release. Only someone who names its tag gets it. |
| `force_update` | Stable only. Every older copy stops calling the tenant until it updates. |
| `message` | One line shown with the update notice, such as what the release fixes. |

The workflow (`.github/workflows/publish.yml`) runs `scripts/release/publish.mjs`, which:

1. picks the version from the tags;
2. writes it into `package.json`, `.claude-plugin/plugin.json`, `gemini-extension.json` and `.codex-plugin/plugin.json`;
3. points the plugin entry in `.claude-plugin/marketplace.json` at the new tag, and writes Copilot's `.github/plugin/marketplace.json` and `plugin.json` and Antigravity's `.antigravity-plugin/plugin.json` and `mcp_config.json` from the Claude files, and names the new tag in the README's Antigravity command;
4. names the CHANGELOG's `## Unreleased` section after the version (stable);
5. writes `release.json`: `{ "version", "minRequiredVersion", "message" }`.

It then runs the tests and `claude plugin validate`, commits, tags `vX.Y.Z`, pushes the tag, creates the GitHub Release with `release.json` and `install.sh` attached, and, for a stable release, moves `main` to that commit. A beta's commit stays off `main`.

## Who can change `main` and the tags

Two rulesets guard what agents install from:

- **main**: changes arrive only by a pull request with one approval and the five checks green (smoke suite, plugin manifest, secret scan, dependency audit, software bill of materials). No force-push, no deletion. Admins may merge a pull request without the approval; nobody pushes to `main` directly.
- **release tags** (`v*`): nobody creates, moves or deletes one by hand.

Only the publish workflow's deploy key gets past both. Its private key is the `RELEASE_DEPLOY_KEY` secret of the `release` environment, which hands it only to runs on `main`, and the workflow stops unless the person who started it is a repository admin.

Write what changed under `## Unreleased` at the top of `CHANGELOG.md` as you merge; the next stable release takes it as its notes.

## How each agent finds the release

| Agent | Reads | Installs |
|---|---|---|
| Claude Code | `.claude-plugin/marketplace.json` on `main`: `"source": { "source": "url", "url": "…/unifyapps-headless.git", "ref": "vX.Y.Z" }` | that tag |
| Copilot CLI | its own `.github/plugin/marketplace.json` on `main`, the same entry | that tag |
| Codex | the Claude catalogue (a `url` source; Codex skips a `github` one) | that tag |
| Gemini CLI | GitHub's Latest release | that release |
| Antigravity | the tag in its install command, `…/unifyapps-headless/tree/vX.Y.Z`, which each stable release writes into the README | that tag |
| OpenCode | the tags matching `#semver:*` in its install command | the highest one |
| `install.sh` | GitHub's Latest release | that release's source |

Claude Code and Copilot update only when the version changes; the version and the catalogue's `ref` change together, only in a release.

## Required updates

Every copy reads `release.json` from the Latest release (`https://github.com/unify-apps/unifyapps-headless/releases/latest/download/release.json`) when a session starts and before tool calls, at most once an hour (`scripts/lib/update-check.mjs`). Below `minRequiredVersion`, the session start says to update, with the command for that agent, and every tenant tool call is refused with `UPDATE_REQUIRED` before anything is sent. Below `version` only, the session start mentions the update once. When GitHub cannot be reached, nothing is blocked.

A normal release keeps the minimum the previous release set, so it never lifts a forced update.

## Codex

Codex does not expand `${CLAUDE_PLUGIN_ROOT}` and gives an MCP server no plugin-root variable (codex-cli 0.169.0). `.codex-plugin/plugin.json` therefore starts each server from the folder Codex installs this version into, `${CODEX_HOME:-~/.codex}/plugins/cache/unifyapps-headless/ua/<version>`, and the solution server tells the model that folder through its MCP instructions and writes the builders to `~/.codex/agents`. The manifest depends on the version, so the release writes it; `node scripts/release/codex-manifest.mjs` writes it by hand, and `npm test` fails when it is stale.
