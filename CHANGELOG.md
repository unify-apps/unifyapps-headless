# Changelog

Notable changes to UnifyApps Headless.

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
