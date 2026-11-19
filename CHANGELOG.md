# Changelog

Notable changes to UnifyApps Headless.

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
