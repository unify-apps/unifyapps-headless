# Security

## Report a problem

Report it privately on GitHub: open this repository's **Security** tab and choose **Report a vulnerability**. Only the maintainers see the report. Please do not open a public issue or pull request for a security problem.

Tell us:

- what an attacker can do, and what they need first,
- the steps to reproduce it,
- the UnifyApps Headless version (`version` in `package.json`) and the coding agent you used.

Never include a cookie, token, password or customer data in the report.

## Scope

The UnifyApps Headless plugin code in this repository: `scripts/`, `hooks/`, `agents/`, `skills/`, `setup.sh` and the plugin and MCP config. Problems in the UnifyApps platform or in Claude Code itself go to their own owners; tell us if you are not sure.

## Where the builder guard runs

Builder agents read tenant content, and an instruction planted there could try to steer one. In Claude Code, a `PreToolUse` hook (`scripts/tool-guard.mjs`) limits every builder, even with permission prompts off:

- it writes only inside the working folder or the system temp folder, never to files that run code or steer the agent later,
- it cannot read or search the person's saved sign-in, SSH or cloud keys, or a test user's sign-in,
- its shell is refused those same secrets, scheduled jobs, `sudo`, and scripts that call the tenant directly,
- it cannot forge the person's yes to a call that cannot be undone.

Codex, OpenCode and Gemini CLI do not run this hook. There, a builder is limited by that agent's own permission settings and the tenant's permissions for the signed-in user. The MCP bridge still asks the person before a delete in every agent, but outside Claude Code nothing stops a steered builder from forging that yes on disk. If you use UnifyApps Headless with one of these agents, keep its permission prompts on, or its sandbox, for builder sessions. Porting the guard to OpenCode is planned.

## Please do not

- test against a production tenant, or against data that is not yours,
- read, change or delete other people's data,
- share the problem publicly before it is fixed.

## What happens next

We reply within 3 working days, and tell you when a fix ships.
