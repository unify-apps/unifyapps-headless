---
name: native-setup
description: Runs once to set up and repair the devices the ua loops drive for a UnifyApps MOBILE app - Xcode and the iOS 18 runtime, Rosetta, argent, baguette, the UnifyApps Preview app and a pool of iOS simulators sized from the laptop's RAM and cores, with a farm view of every simulator and a doctor check of each. Checks everything first and installs only what the person ticks, then writes the solution's loops profile (the app, the design source, the publish policy, the max passes and the test users) and one memory line so teammates find it. Never writes to the tenant otherwise and never updates UnifyApps Headless. Use when the session-start loops health line names something missing, or the person asks to set up a laptop for the loops, fix a missing simulator, install a new Preview build or install baguette.
user-invocable: false
argument-hint: "[--app <path> | --url <url>] [--count N]"
allowed-tools: Bash(node:*), Bash(bash:*), Read, Write, Edit, Agent, Skill, AskUserQuestion
---

# Native setup

`native-setup [--app <path> | --url <url>] [--count N]`

Runs once: gets this laptop ready for the ua loops on the solution's
MOBILE app (`/ua:native-fix-loop`, `/ua:native-build-loop`) and the
skills they use, and writes the solution's loops profile.

## Run it

1. Load `ua:loop-orchestrator` and follow it for this skill (goal
   `setup`): the platform, the run folder and the run log come from there. A
   missing health item never stops this skill: fixing it is the job.
   On a WEB app (`loops platform` answers it), say
   "This is a WEB app. Nothing to set up: the web loops install their own browser." and stop.
2. Then the steps below, in order.
3. Finish as the orchestrator's § Finish says, with the outputs below.

## When

The first run on a laptop, a repair when `loops health` names something
missing (the session-start health line offers it), a new Preview build, or a
solution folder with a MOBILE app and no `.nebula/loops/profile.json`.

## Mode and limit

Starts in `look` (checks only). It may install tools and simulators on this
laptop, each only after the person ticked it in the install approval, and write the
solution profile. It never writes to the tenant beyond one memory line,
never updates UnifyApps Headless, and never touches `.gitignore`.

## Steps

1. **Doctor.** `loops doctor --json`: Xcode and the **iOS 18 runtime** (18.6
   by default), Rosetta (the Preview simulator build is x86_64), node, argent,
   **baguette** (it needs Xcode 26 and macOS 15 or later; checked against an
   iOS 18 simulator, and used as the viewer and farm only when its input does
   not work there), the Preview app, ports 3001 and 8421, the open-file table, and the laptop's size with the pool and agent
   limit it suggests ([limits](../loop-orchestrator/references/limits.md)).
   For the Figma row, which only the model can check, call
   `mcp__claude_ai_Figma__whoami` once (or run the `setup-toolchain` workflow,
   which probes every row in parallel with `loops doctor --only <check> --json`
   and returns `{checks, installs, manual, missing}`).
2. **One table**, `tool | status | version | fix`, one row per check:
   `ok`, `fix` (a command), `missing`, `optional`, `check` (a row only a person
   can settle). Rows with no answer are listed under it.
3. **Install approval**: `loops setup` (no `--yes`) lists each install it would run
   with its consent line and exits 3. Ask one multi-select of those, each
   option labelled with its id and exact command (`baguette: brew install baguette`,
   `argent: npm i -g @swmansion/argent@0.28.0`, `ios-runtime`, `pool`,
   `preview`). Required rows first. Manual rows are never options; their steps go under the table:
   the iOS runtime (`xcodebuild -downloadPlatform iOS -buildVersion 18.6`, a
   long download), the Figma sign-in through the desktop app's connector
   settings, `/ua:setup` when the folder is not set up.
4. **Install what was ticked**: `loops setup --yes --only <ticked ids>`,
   output shown; a failed item stops the list. Never an item the person did
   not tick.
5. **The Preview app on the pool.** The loops cannot download the Preview app
   themselves: ask the person for the UnifyApps Preview app's iOS simulator
   build. `loops preview install --app <path>` installs a local `.app` or
   archive of one, `--url <url>` downloads one; either installs on every pool
   simulator. `loops setup --app <path>` (or `--url`) takes the same build
   before it creates the pool. Without a build, say what is missing and stop
   at this step.
6. **The pool.** `loops pool up` creates or boots `ua-sim-<nn>` simulators on the
   iOS 18 runtime up to the size `health` reports, and grows a smaller pool; `loops pool status` shows
   each one `Booted` with the app installed. A simulator the person already
   has is taken in with `loops pool adopt <udid>`, never driven from outside.
7. **The farm view.** `loops pool watch` starts `baguette serve` and opens the
   farm at `http://127.0.0.1:8421/farm` in the browser, so the person sees every
   simulator. It keeps running; say how to stop it.

## The solution profile

1. `ua solution context --json` and `loops platform <appId> --json` for
   each app: a `MOBILE` app can be chosen; with none, stop and say the app
   itself is made through UnifyApps Headless first. The run settings, at most four
   questions: the app and its endpoint, the design source, the publish policy
   (`ask`, `draft-only`), the max passes (3, 5, 8; default 4) with the test
   users as free text (`withData=<user>; empty=<user>`, names only, never a
   password). Write it with `loop-preflight`'s
   [profile](../loop-preflight/references/profile.md) script to
   `<solution>/.nebula/loops/profile.json`; show it back.
2. **One memory line**, so every teammate's session finds the profile:
   `ua memory remember notes "Loops profile: app <name> (<id>); design <source>; max passes <n>; publish <policy>; test users <withData>, <empty>"`.
3. **Health again.** `loops health --fresh`: the line the session start will
   show from now on.

## Stop fact

`loops health --fresh` reports every required row `ok`, the pool at its size
with the Preview app on every simulator, and the profile valid; or the run
stops at the first required row still missing, with its one instruction.

## Outputs

The final table, the pool status and the farm link, the profile path, the
memory line, and the next step (`native-audit <page>` to find what
is wrong, or `/ua:native-fix-loop <page>` to fix it).

## Approvals

The install approval (installs) and the run settings (the profile). Nothing else.
