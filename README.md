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

UnifyApps Headless works in Claude Code, Codex, OpenCode, Gemini CLI and GitHub Copilot CLI. Install it in the agent you use, then sign in to your UnifyApps tenant with `/ua:setup`. Updates are manual: run the update command when you want a newer version.

### Claude Code

Add the repository as a plugin marketplace, then install the plugin from it:

```bash
claude plugin marketplace add unify-apps/unifyapps-headless
claude plugin install ua@unifyapps-headless
```

Start `claude` in an empty folder and type `/ua:setup`.

```bash
# update
claude plugin marketplace update unifyapps-headless
claude plugin update ua@unifyapps-headless

# remove
claude plugin uninstall ua@unifyapps-headless
claude plugin marketplace remove unifyapps-headless
```

### Codex

Codex's own plugin command cannot start the plugin's tenant tools in your folder yet, so Codex uses the installer script. It downloads the plugin, installs Node 22 if it is missing, and registers the plugin and its builder agents with Codex:

```bash
curl -fsSL https://raw.githubusercontent.com/unify-apps/unifyapps-headless/main/install.sh | bash -s -- --agents codex
```

Start `codex` in an empty folder and type `$ua:setup`.

```bash
# update: run the same command again

# remove
curl -fsSL https://raw.githubusercontent.com/unify-apps/unifyapps-headless/main/install.sh | bash -s -- --uninstall --agents codex
```

### OpenCode

Install the repository as a global OpenCode plugin:

```bash
opencode plugin -g github:unify-apps/unifyapps-headless
```

Start `opencode` in an empty folder and type `/ua:setup`.

```bash
# update
opencode plugin -g -f github:unify-apps/unifyapps-headless

# remove: delete the "github:unify-apps/unifyapps-headless" line
# from "plugin" in ~/.config/opencode/opencode.jsonc
```

### Gemini CLI

Install the repository as a Gemini extension:

```bash
gemini extensions install https://github.com/unify-apps/unifyapps-headless --consent
```

Start `gemini` in an empty folder, trust the folder when Gemini asks (the tenant tools stay off otherwise), and type `/ua:setup`. Gemini has no builder agents, so the main session does their work.

```bash
# update
gemini extensions update unifyapps-headless

# remove
gemini extensions uninstall unifyapps-headless
```

### GitHub Copilot CLI

Add the repository as a plugin marketplace, then install the plugin from it:

```bash
copilot plugin marketplace add unify-apps/unifyapps-headless
copilot plugin install ua@unifyapps-headless
```

Start `copilot` in an empty folder. Copilot has no slash commands for plugins, so ask in words: "set up UnifyApps Headless here".

```bash
# update
copilot plugin marketplace update unifyapps-headless
copilot plugin update ua@unifyapps-headless

# remove
copilot plugin uninstall ua@unifyapps-headless
copilot plugin marketplace remove unifyapps-headless
```

### After installing

`/ua:setup` signs you in to your tenant through your browser and picks the solution to work on. Then ask for the work in your own words. Full steps: [getting_started.md](./getting_started.md).

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
