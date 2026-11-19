<p align="center">
  <img src="./skills/plan/references/unifyapps-logo.svg" alt="UnifyApps" height="40">
</p>

<h1 align="center">UnifyApps Headless</h1>

<p align="center">
  <strong>Build UnifyApps solutions from your AI coding agent.</strong><br>
  Say what you need in plain words. UnifyApps Headless builds the objects, automations, apps and AI agents, then proves each one works.
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="./getting_started.md">Getting started</a> ·
  <a href="./CHANGELOG.md">Changelog</a>
</p>

UnifyApps Headless is a plugin for people who build UnifyApps solutions. You talk to it like a teammate. UnifyApps Headless reads your tenant, finds what a change is wired to, and builds it: small changes itself, the rest through builder agents that work in parallel, one per app, automation, object or AI agent. Every write is read back from the platform before UnifyApps Headless calls it done. When you want to review a plan first, type `/ua:plan`.

## Example

```
> Add a purchase order form. Orders over $5,000 need a manager's approval.

  This folder is not set up yet, so I'll set it up first.
  Tenant: your-tenant.unifyapps.com · signed in · working on Purchase orders.

  Building the purchase order form now: the Purchase order object first,
  then the approval automation and the New order page side by side.

  Purchase order object: created.
  Route for approval: created and deployed.
  New order page: built and wired to the automation.

  Done. Orders over $5,000 now wait for a manager. A $900 order is approved
  at once. Open the page: <link>
```

No platform UI and no hand-built task list. Ask in chat, in your own words. UnifyApps Headless sets the folder up the first time, then does the work. Every write is read back and shown with its link.

## Install

UnifyApps Headless works in Claude Code, Codex, OpenCode, Gemini CLI and GitHub Copilot CLI. Install it in the agent you use, then sign in to your UnifyApps tenant with `/ua:setup`.

### Claude Code

Install:

```bash
claude plugin marketplace add unify-apps/unifyapps-headless
claude plugin install ua@unifyapps-headless
```

Start `claude` in an empty folder and type `/ua:setup`.

Update:

```bash
claude plugin marketplace update unifyapps-headless
claude plugin update ua@unifyapps-headless
```

Remove:

```bash
claude plugin uninstall ua@unifyapps-headless
claude plugin marketplace remove unifyapps-headless
```

### Codex

Install:

```bash
codex plugin marketplace add unify-apps/unifyapps-headless
codex plugin add ua@unifyapps-headless
```

Start a new `codex` session in an empty folder and type `$ua:setup`.

Update:

```bash
codex plugin marketplace upgrade unifyapps-headless
codex plugin add ua@unifyapps-headless
```

Remove:

```bash
codex plugin remove ua@unifyapps-headless
codex plugin marketplace remove unifyapps-headless
```

### OpenCode

Install (OpenCode 2 and later):

```bash
opencode plugin add 'github:unify-apps/unifyapps-headless#semver:*'
```

Start `opencode` in an empty folder and type `/ua:setup`. `#semver:*` installs the newest release rather than work in progress.

Update (OpenCode keeps the downloaded copy of a GitHub plugin, so the update removes it before adding the newest release):

```bash
opencode plugin remove 'github:unify-apps/unifyapps-headless#semver:*'
rm -rf ~/.cache/opencode/npm/git-unifyapps-headless-*
opencode plugin add 'github:unify-apps/unifyapps-headless#semver:*'
```

Remove:

```bash
opencode plugin remove 'github:unify-apps/unifyapps-headless#semver:*'
```

On an older OpenCode, install with `opencode plugin -g 'github:unify-apps/unifyapps-headless#semver:*'`. To remove it there, delete that line from `"plugin"` in `~/.config/opencode/opencode.jsonc`.

### Gemini CLI

Install:

```bash
gemini extensions install https://github.com/unify-apps/unifyapps-headless --consent
```

Start `gemini` in an empty folder, trust the folder when Gemini asks (the tenant tools stay off otherwise), and type `/ua:setup`. Gemini has no builder agents, so the main session does their work.

Update:

```bash
gemini extensions update unifyapps-headless
```

Remove:

```bash
gemini extensions uninstall unifyapps-headless
```

### GitHub Copilot CLI

Install:

```bash
copilot plugin marketplace add unify-apps/unifyapps-headless
copilot plugin install ua@unifyapps-headless
```

Start `copilot` in an empty folder. Copilot has no slash commands for plugins, so ask in words: "set up UnifyApps Headless here".

Update:

```bash
copilot plugin marketplace update unifyapps-headless
copilot plugin update ua@unifyapps-headless
```

Remove:

```bash
copilot plugin uninstall ua@unifyapps-headless
copilot plugin marketplace remove unifyapps-headless
```

### Versions and updates

Every install gets the newest release, never unreleased work. When a release is required, UnifyApps Headless says so when a session starts, and its tenant tools stop until you run the update command above. To try a beta, install its tag: `claude plugin marketplace add unify-apps/unifyapps-headless#v0.0.6-beta.1`, `codex plugin marketplace add unify-apps/unifyapps-headless --ref v0.0.6-beta.1`, `opencode plugin add 'github:unify-apps/unifyapps-headless#v0.0.6-beta.1'` or `gemini extensions install https://github.com/unify-apps/unifyapps-headless --pre-release`. [RELEASING.md](./RELEASING.md) explains how releases are made.

### After installing

`/ua:setup` signs you in to your tenant through your browser and picks the solution to work on. Then ask for the work in your own words. New here? Read the [guide](./guide.md): one folder per solution, setup, and the loops.

## What it builds

| What | How | Builder |
|---|---|---|
| **Objects and records** | New objects, fields, indexes and records, designed from how the data is used | `fde-agent` |
| **Automations** | Written as TypeScript, validated, test-run and deployed | `automation-agent` |
| **Apps** | Web and mobile pages: blocks, data sources, events and styling, checked in the browser | `app-agent` |
| **AI agents** | Instructions, model, tools, skills and knowledge (documents, websites, app and data catalog sources, and knowledge sets several agents share), then a test run and publish | `agent-builder` |
| **Code apps** | React apps whose source Code Builder keeps in git: edited and built in a local checkout, then pushed for the engine to build and commit. Plan tasks `code-app` and `code-publish`, one app per agent. | `code-app-agent` |
| **Context graphs** | Sources, nodes, edges, ingestion, and a read-only Q&A assistant | `graph-agent` + `agent-builder` |
| **UI tests** | Test cases written in a real browser and sent to Test Studio; helpers write the tests, several at once. For a code app PR, only the cases its changed files reach are run, on the PR's preview | `app-test-author` and `app-test-affected` skills, `test-author-agent` |
| **Changesets** | Assets moved to another environment, or exported to a file, with every dependency found and reviewed first; the destination approves and deploys on its own Inbound page | `changeset-manager` skill, in the main session |

Connections are read only. UnifyApps Headless uses them but does not create them.

## License

[MIT](./LICENSE). Copyright © 2026 UnifyApps. The license covers the code; it grants no right to use the UnifyApps name or logo.
