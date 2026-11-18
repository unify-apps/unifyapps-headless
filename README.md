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

Works in Claude Code, Codex, OpenCode, Gemini CLI and GitHub Copilot CLI. You need a UnifyApps tenant you can sign in to.

**Every agent on your machine at once** (macOS or Linux; it asks which agents, and installs Node 22 if missing):

```bash
curl -fsSL https://raw.githubusercontent.com/unify-apps/unifyapps-headless/main/install.sh | bash
```

Add `-s -- --agents claude,codex` to pick agents without the question, or `-s -- --uninstall` to remove it.

**Or one agent, with its own command:**

| Agent | Install |
|---|---|
| Claude Code | `claude plugin marketplace add unify-apps/unifyapps-headless && claude plugin install ua@unifyapps-headless` |
| OpenCode | `opencode plugin -g github:unify-apps/unifyapps-headless` |
| Gemini CLI | `gemini extensions install https://github.com/unify-apps/unifyapps-headless --consent` |
| Copilot CLI | `copilot plugin marketplace add unify-apps/unifyapps-headless && copilot plugin install ua@unifyapps-headless` |
| Codex | use the installer above with `-s -- --agents codex` |

**Then** open your agent in an empty folder and type `/ua:setup` (`$ua:setup` in Codex; in Copilot CLI, ask in words). Setup signs you in to your tenant and picks the solution to work on. Full steps: [getting_started.md](./getting_started.md).

Updates are manual: run the same install command again.

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

Copyright © 2026 UnifyApps. Licensed under the [Elastic License 2.0](./LICENSE).

You may use, copy, modify and redistribute UnifyApps Headless, inside your company or for your clients, on the terms in [`LICENSE`](./LICENSE). You may not offer it to others as a hosted or managed service, or remove or work around any licence notice in it. UnifyApps and the UnifyApps logo are trademarks of UnifyApps; this licence grants no right to use them.
