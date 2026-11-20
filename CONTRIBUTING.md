# Contributing

Thanks for helping improve UnifyApps Headless.

## Before you start

Install the plugin from a checkout and run the checks:

```bash
node scripts/install-local.mjs   # installs this checkout as the ua plugin
npm test                         # the smoke suite
npm run validate                 # checks the plugin manifest
```

`npm test` needs Node 22 or newer and reaches no network and no tenant.

## Reporting something

Open an issue. For anything security-related, read [SECURITY.md](./SECURITY.md)
first and do not open a public issue.

A good report says what you asked for, what happened, and what you expected.
Never paste a cookie, token, password or customer record into an issue.

## Changing a skill

A skill is a folder with a `SKILL.md`: YAML frontmatter, then the instructions.
Only `name` and `description` are required. `name` must be lowercase letters,
numbers and hyphens, and must match the folder name.

```
skills/<name>/
├── SKILL.md       what to do
├── references/    longer detail, read only when SKILL.md points at it
└── scripts/       anything the skill runs
```

Keep `SKILL.md` short and move depth into `references/`. An agent loads every
skill's description at the start of a session and the body only when the skill
is used, so a long body costs every session that never needs it.

The `description` is what an agent reads when deciding whether to use the skill.
Say what it does **and** when to use it, in words someone would actually search
for.

A skill that is not a command a person types sets `user-invocable: false`.

## Changing code

`scripts/README.md` explains what every file under `scripts/` is for. Read it
before you add or move one, and update it in the same change.

- `scripts/cmd/` — one file per CLI area
- `scripts/lib/` — pure logic: no files, no network
- `scripts/platform/` — talking to the tenant
- `scripts/folder/` — the solution folder on disk
- `scripts/release/` — what ships

## Two rules that hold everywhere

**A delete waits for the person.** The tenant bridge refuses any call that
cannot be undone until the person themselves says yes — through their agent's
own confirm tool, or through the question the bridge asks over the connection.
Never add a flag, setting or environment variable that skips this.

**A write is proved by a read.** Nothing is reported as done on the strength of
a success status. Read the entity back from the platform first.

## Pull requests

Say what changed and why, and how you checked it. If you changed something that
touches a tenant, say which tenant you tried it on and what you read back. If
you could not test part of it, say so plainly — that is more useful than
silence.

Add a line to `CHANGELOG.md` under `## Unreleased`.
