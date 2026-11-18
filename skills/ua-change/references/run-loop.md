# Run loop (shared by every plan)

## Contents
- Improvement feedback
- A new message during the run
- Plan changes discovered during execution
- Rules

Before the first send of a plan, run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-node.sh" "${CLAUDE_PLUGIN_ROOT}/scripts/permissions.mjs" check --json`. It only reads the person's Claude settings. When it answers `ok: false` and the person has not heard it for this plan, tell them once, in one line, before the builders start: Claude Code's auto mode may refuse the builders' calls while they are away, until they run `command` from that answer once, in their own terminal (in the desktop app, the Terminal app). Never run that command yourself, and start sending anyway: § Rules says what to do when a call is refused.

`plan ready --mark` picks the agents, writes each batch's message file from [dispatch-template.md](dispatch-template.md), and its `next` lists the exact calls that send them. Every agent runs in the background, records its own report with the `plan report` command its message names, and ends with the line that command printed.

```text
send:
  R = plan ready <planId> --mark --json
    add --agent-ids "<agentName>=<agentId>,…" for every Agent(...) call made since the last plan ready: its name, and the agentId its result gave
    add --no-resume once, after a SendMessage that does not exist or is disabled in this session (see below)
    add --spread once, when the person asked for this plan's work to run in parallel: each fde, automation and agent-builder batch then holds one task
  exit 5 (R.status is terminal) → if interrupted, say PLAN_INTERRUPTED; otherwise report R.status as recorded; stop without plan finish and without sending work
  exit 6 → say PLATFORM_UNREACHABLE; stop (the plan stays in_progress and resumable)
  do what R.next says, in order, and copy each call exactly as written:
    Agent(...) and SendMessage(...) lines → make all of them in ONE message; keep the agentId each Agent(...) result gives, with its name, for the next plan ready
    "If that send fails: Agent(...)" → make that call only when the SendMessage above it fails, with that SendMessage's message as its prompt
    "Ask the person ..." lines (the questions in R.ask) → one AskUserQuestion for all of them; record each answer with the command its line names; go to send
    "Run the page quality pass on ..." → it comes alone in R.next, once every page task, page review and fix task is settled and nothing else is left to send, ask or wait for; load app-page-quality and follow its § Procedure; after plan audit, go to send (plan ready --mark again). Never confirm a publish that R.heldForQuality names
      page-audit.mjs exits non-zero for a page (it cannot audit it: a stale or missing cache, a cycle, no root) → run solution refresh --json and run it once more; still failing → say in one line which page could not be audited and why, and ask one AskUserQuestion: "Publish without auditing <page>" or "Stop here"
        Publish without auditing → keep the page in the audit file's pages with unaudited: {reason: "<why>", words: "<their own words>"} and no findings, and record it with plan audit as usual
        Stop here → end the turn; the publish stays held and the plan stays in progress
    "Wait for the running agents to finish." → wait for their notifications
    "Wait for the running agents of your other plan to finish ..." → every agent this session may run at once (6) is busy; wait for a builder notification, then go to send
    "Wait until <time>: run sleep <seconds> in the background, ..." → run that sleep with run_in_background; when it ends, or a builder notification comes first, go to send
    "Run plan ready <planId> --mark --json again." → go to send
    "Run plan reclaim <planId> --json, then ..." → run both, as written
    "Run plan finish <planId> --json." → finish
    "Run plan finish <planId> --failed --reason ..." → run it as written; stop
  after sending, say R.progress in one sentence and end the turn

on each builder notification:
  the reply starts with "Recorded" → show that line; sort any plan_change: note in it before sending more work; tell the person the path of any Key file: note in it, and NEVER open the file or print the key; go to send
  the reply says `Blocked by auto mode: plan report` → do not run plan report yet: running it for the builder is the same command sent another way, refused as [Auto-Mode Bypass]. Ask for the permission change in § Rules, naming the Bash command `node <plugin folder>/scripts/ua.mjs plan report` instead of a tool; once they say it is done, go on with the next line
  otherwise (the builder stopped early, its plan report failed twice, or the person cleared a blocked plan report) → write the reply's last fenced json block, or {} when there is none, to a file; run once: plan report <planId> --agent-name <agentName> --report-file <file> --json
    with {}, plan report records the builder's own report file when the builder wrote one, and gives every task it does not settle its attempt back
    the stop says the usage limit or rate limit was reached, or HTTP 429 → write {} and add --usage-limit: that hand-back never counts toward failing the task. Then wait until the limit resets before you go to send: when the stop names a time, run sleep until then in the background; when it does not, tell the person in one line and wait for their message
    exit 5 → the plan is closed; drop the report
    it says there is no running batch for that agent → the report was already recorded
    then go to send

when the person asks how far the build is: run plan ready <planId> --json without --mark, which marks nothing, and answer with its progress line; never go to send for it, because send marks ready batches running and a batch with no Agent(...) call behind it is stranded

when the person asks for only part of a running plan ("send just these three"): never go to send for it, because a plan is approved and run as a whole and plan ready --mark takes no list of ids, so it starts every ready batch, deploys included; say that in one line, and ask with AskUserQuestion whether to run the whole plan or drop the rest; only on "drop the rest" take it as a plan change (§ Plan changes): leave the dropped tasks out of a plan revise tasks file (dropping more than half of what is left takes --impact major), or skip them with plan task <planId> <ids> --status skipped --json, which also skips every task that waits on them, so never skip a task that one they want waits on; then go to send for what is left

finish:
  plan finish runs only when R.next says so; a publish held for quality is never confirmed first; a publish the person declined at the page quality step is skipped with the declined call, after which plan finish follows as usual
  plan finish <planId> --json; then plan get <planId> --json for the tasks and meta the run-shape check below needs; then Finish (outcome line, the entityTable plan finish returned, feature upserts, offers)
```

`R.busy` lists the agents that still hold running tasks, and `R.next` already accounts for them. Decide from `R`, never from memory: after compaction you may not remember who is out.

Before a `SendMessage` to a builder still running from an earlier batch, weigh its last reported token count the way [ua-change § Pass results on](../SKILL.md) does: above 250k, skip it and make the matching `Agent(...)` call instead, for the same reason — a full re-send costs more than a fresh start. This holds everywhere this loop resends to an agent already at work, not only where `SendMessage` is missing or failed.

If a `SendMessage` fails, or you skipped it for the 250k reason above, make the `Agent(...)` call on the line under it: same name, same file, and pass its new agentId on the next plan ready. It counts as the same attempt.

When this session's Agent tool has no `name` parameter, leave `name:` out of each `Agent(...)` call and keep the rest as written. Each call's `description` starts with its agentName, so match each result to its agentName by that description, never by the order of the results: one failed start shifts every pair after it.

When `SendMessage` is missing or disabled in this session, make the `Agent(...)` call under it and add `--no-resume` to the next `plan ready <planId> --mark --json`, once — never for a single builder over the 250k mark above, which still leaves `SendMessage` open for every other one. From then on `R.next` holds only `Agent(...)` calls. If that `Agent(...)` call fails too, or the first `Agent(...)` for a new agent fails, take its tasks back with `plan reclaim <planId> --agent-name <agentName> --json`, then go to send. If the same agent cannot be sent to a second time, stop: `plan finish <planId> --failed --reason "Cannot start <agentName>." --json`.

`plan reclaim` runs only in four cases: the reclaim line in `R.next`, after `claude --resume` (reclaim each plan the SessionStart reminder names once, then go to send), for one agent that could not be sent to, and for an agent that ended its turn without recording a report (an auto-mode block can do this). That last agent's task stays `running`, so `plan task --status` and `plan revise` both refuse until `plan reclaim <planId> --agent-name <agentName> --json` takes it back, with the attempt given back. Never take tasks back from an agent that is still at work.

A task the main session performs itself instead of sending it is also left `running` once `plan ready --mark` has staged it under a builder's agentName: take it back first with `plan reclaim <planId> --agent-name <agentName> --json`, then record it with `plan task <planId> <id> --status done --json`.

### Improvement feedback

Something is worth a report when it got in the way of the work, wherever it sits: in UnifyApps Headless (its CLI, hooks, skills, agent files, the guide), in an MCP tool or its knowledge sheets, or in the platform itself. Report it even when the work ended well. Catch these:

- a tool or command answered success, and the read-back showed something else;
- a tool did something it did not say: it added a value, dropped a key, or changed something else;
- an error that did not say what to fix, or a step that needed two tries or a workaround;
- guidance that was wrong, missing, or said two different things (a skill, the guide, an agent file, a knowledge sheet, a tool description);
- text UnifyApps Headless showed the person that was wrong (a dialog, a summary, a count);
- a builder that stopped or was handed back, or a step that ran past 10 minutes;
- the person had to correct you;
- work that was slower than it needed to be: a script you had to write, many calls where one list call would do, a read repeated because a tool answered too little, or a builder briefed for steps a tool could do in one call. This is a feature request, with `Where: mcp-tool` when a tool change fixes it.

Skip what worked as designed: a refusal UnifyApps Headless meant (a delete waiting for a yes), a sign-in prompt, a choice the person declined.

Nothing in this section is sent by itself. A report reaches the UnifyApps Headless team only when the person runs `/ua:give-feedback`, which shows them what it will send and asks first. Fix failures within the normal retry. Never block, delay, retry or broaden work only to report.

Bug blocks start `feedback:` (`Bug:`, `Context:`, `Where:`, `Evidence:`, `Cause:`, `Regression:`). Feature blocks start `feature:` (`Feature:`, `Where:`, `Evidence:`, `Benefit:`, `Scope:`, `Acceptance:`). `plan finish` returns the builders' blocks once each in `notes.feedback` and `notes.feature`; for chat work, take them from the builders' reports. Start the two lists from those and add your own.

A capability the actual work needed that UnifyApps Headless, its tools or the platform do not offer, a step done by hand because no tool does it, or a tool change that would have made this work much faster, is a feature request. Use it only when current promised behavior is correct; anything broken or misleading stays a bug. Do not brainstorm. Ignore speculative, cosmetic, one-off or tenant-specific wishes.

At Finish, make a single lightweight check of three things: already-visible observations, the notes `plan finish` returned, and how the tasks went. For the tasks, read only what `plan get` carries: each task's `attempts`, `handBacks`, `usageStops`, `startedAt` and `endedAt`, and `meta.revisionHistory`, `meta.forkReason` and `meta.interruptionReason`. Do not read the transcript, tool logs or any file, and make no extra call. Look again at a task that took more than one attempt, was handed back, forced a revision or fork, or ran past 10 minutes. Ask as the developer on this build would: was there a smoother way, and is the gap in the platform, a missing feature, or wrong guidance? An error that never said what to fix is itself the bug. Write it up once, without investigating further.

For chat work there is no `plan get`: look back over this chat for the same signs, the list at the top of this section: errors, second tries, builders that stopped, corrections, and the `feedback:` and `feature:` lines in the builders' reports.

When both lists are empty, say nothing about them. Otherwise end the Finish message with one short line per observation, in plain words (what got in the way, and where), then one line offering `/ua:give-feedback` to report them. No secrets, stored values or long logs in those lines. Never run `session save` yourself and never ask a question about it: the person decides whether to send anything.

### A new message during the run

A message from the person while builders run is a new request unless it is about this plan's work. Never answer it from memory, and never let the run swallow it.

1. Judge it like any message: `state resolve` names its targets, and [entity-membership.md](entity-membership.md) has the facts about where each one belongs.
2. Answer the question, ask what only the person can decide, or hand the work to another session. Start nothing new on the tenant that touches this plan's entities until it ends: the plan's tasks hold them. Other work may start, as in chat.
3. Go back to send. Say in one line that the build keeps running, with its `progress` line.

A message about this plan's work follows § Plan changes below.

### Plan changes discovered during execution

Sort each discovery by the three levels in [grill.md § 2](../../plan/references/grill.md). A late technical correction is not a requirement change while the accepted spec stays true. A bounded yes (one task, same outcome) is asked as that task's question and recorded with `plan task <planId> <id> --answer`.

- **Absorbed or major, same plan.** Stop sending. Wait until no task is `running`. An absorbed change goes on with one line to the person. A major change shows what is done and the new writes, and asks `Add to this change` or `Stop here`. `Stop here` is `plan finish --user-requested`. On `Add to this change`, or for an absorbed change, run `plan revise <planId> --tasks-file <json> --impact absorbed|major --reason "<discovery>" [--evidence-file <json>] --json`. A changed `deletes` is never absorbed, even when it only narrows what goes: `plan revise` refuses it with `A new delete cannot be absorbed silently.`, so take the major path. The tasks file holds only the tasks that are not done. Their `dependsOn` may name done tasks. A pending task left out of the file is removed, and the reply names it. A deploy or publish that only gains a wait on a task this revise adds stays absorbed. `--evidence-file` holds a JSON array of strings, one line each. A deploy or publish the accepted spec does not name under `## Ready when` (plan revise refuses it and lists every such line at once) is a major change: ask the person, naming each release and the tenant, and on their yes add `--ready-when "deploy <automation>; publish <app>" --release-yes "<their own words>"`. The lines go into the accepted spec, with a `## Touches` line for a new entity, and the spec keeps their words and who ran it under `readyWhenAdded`. The release still waits for `plan confirm` when the plan asks before releases. Then go to send.
- **An `index needed:` note** is an absorbed change: add one `object` task on that object, whose body names the fields, the read that needs them and its `Speed:` line. Nothing waits on it, so it runs beside the rest.
- **Major, new plan** (only when the person asks): `plan fork <planId> --tasks-file <json> --reason "<discovery>" [--evidence-file <json>] --json`. Show the new plan and ask one plain yes before it starts.
- **Requirement change.** `plan interrupt <planId> --reason "<change>" --json`. Refresh, run `impact` again, ask only what is unclear ([questions.md](../../plan/references/questions.md)), and propose the replacement with `plan propose ... --derived-from <old specId>`. Its tasks account for the writes that already landed.

### Rules

Any terminal status stops dispatch. Only `interrupted` is described as interrupted. Never send from an old batch list or `next` after a plan changes, and never apply a late report after a terminal status.

When a `Recorded` line says `Sign-in expired`, sign in again the way `/ua:setup` does, then go to send. A `needs_confirmation` question comes back in `R.ask`: record the answer with `plan task <planId> <id> --answer "<answer>" --json`. An answer that picks another way than the task's body says is a plan change, not an answer: the builder follows the body, so revise the body with `plan revise` (§ above) instead. An answer is not the yes a delete or a release waits for: only `plan confirm` saves that, and `--answer` on such a task says the gate is still open. New words for a task waiting for its retry are recorded the same way: `--answer` takes any pending task and replaces its older answer. For a task `plan ready --mark` just marked running, it rewrites that batch's message file. Record it before you send that file. If you already sent it, also tell that agent with `SendMessage` when it holds under 250k tokens; over that, send the rewritten file to a fresh `Agent(...)` call instead, the same way as above. A question that holds `CONFIRM_REQUIRED (d_…)` is the tenant bridge refusing a delete. Ask it with AskUserQuestion yourself: put the summary and the `(d_…)` id in the question text as one quoted phrase, exactly as the refusal gives them (`"<summary> (<id>)"`, word for word), with `Yes, go ahead` first and `No` second. The approval check matches that phrase exactly: a paraphrase or a reworded summary does not unlock the call, and the refusal comes back saying the yes did not count. Only that dialog's answer unlocks the call, once; a yes typed in chat or written into `--answer` does not. Then record the answer with `--answer` so the builder makes the same call again. A builder whose answer is a no reports `declined`. That task and every task waiting on it are skipped, listed in `alsoSkipped`. Tell the person those tasks in one line.

A question that starts `Blocked by auto mode:` is Claude Code's own permission check refusing a builder's call. Never make that call yourself, and never answer a bare yes for the builder: auto mode refuses either as `[Auto-Mode Bypass]`. Ask the person whether they want it done, naming the tool, the entity and the tenant. Say in the same question that their yes in chat may not be enough: what reliably lets the call through is a permission change only they can make. First run `permissions.mjs check --json` (through `run-node.sh`, like every command). When it answers `ok: false`, the person lacks UnifyApps Headless's rules: name its `command`, which they run once in their own terminal (in the desktop app, the Terminal app). It adds every UnifyApps Headless rule for every version, so an update never needs it again. When `ok` is true, or for a call those rules leave to the person (a delete, a connection or credential write, a test user), name the exact full tool name from the builder's tool table (such as `mcp__plugin_ua_automation-code__deploy_workflow`), worded for where they work (`app` from `solution context`):

- `terminal`: open `/permissions` and add an **Allow** rule for that tool; or choose **Recently denied** and press `r` on the call; or press Shift+Tab to leave auto mode for this session.
- `desktop`: `/permissions` does not open in the Claude desktop app. Add the tool to `permissions.allow` in `.claude/settings.local.json` in the working folder, or pick another permission mode than Auto in the mode menu beside the message box.

Never pin a rule to a plugin folder with a version in it (`.../nebula/nebula/3.50.0/...`): it stops matching at the next update.

Never change their settings or the permission mode yourself. Once they say it is done (or just yes), record their own words: `plan task <planId> <id> --answer "<their words>" --json`, and send the batch again to a new agent: make the `Agent(...)` call from `R.next`, never its `SendMessage`, and pass the new agentId on the next plan ready. A builder keeps the permission mode it started with, and its own refusal in its context makes it refuse again: resumed builders were refused 5 times in a row, while a new agent made the same call at once. The same 250k mark from above is a second reason never to resume it instead: either one alone means a fresh agent, never a resend. A refusal names no reason, so do not reword, split or resend the batch to see what passes; that is the same bypass. If it is refused again, ask again for that permission change; never send the call by another route. An `automation-shell` deploy needs no yes from UnifyApps Headless, but auto mode may still refuse it: treat that block the same way.

A question or `error` that names `AGENT_LLM_TOOLS` (`PERMISSION_REQUIRED`) is the tenant refusing UnifyApps Headless's tools to the signed-in person: it keeps refusing that person's calls, yours included, until a tenant admin adds `AGENT_LLM_TOOLS` to that person's role (VIEW to read, and CREATE, EDIT and DELETE to build, or ALL). Stop sending, and tell the person once, in one line: the permission, the tenant, that a tenant admin must grant it when the role lacks it, and that the tenant refuses the same way when it could not read the role's permissions just then. Do not resend, retry, make the call yourself or reach the same result another way until the person says it is granted, or says they already hold it. Then record their words with `plan task <planId> <id> --answer "<their words>" --json` for each task that waits on it, and send once a minute has passed since the refusal: the tenant keeps a permission answer for up to 30 seconds. If it comes back again, tell the person in one line that the role still lacks it; when the line also said UnifyApps Headless could not check the sign-in, have them check it with `/ua:setup` first.

A release the preview did not name, and every task with `deletes`, waits in `R.needsYes`: ask the person, naming what goes and on which tenant, and save the yes with `plan confirm`. Ask the question `R.next` gives word for word: for a deploy of an automation that runs on a schedule, a webhook or an app event, it ends with what the automation then does by itself (`Once deployed it runs by itself every 15 minutes.`), read from the cached automation. For a publish of an app, it names what else the publish ships, since a publish releases the whole draft: the pages changed since the last publish that this plan did not build, changes to the app's settings, theme or menu, and the other sessions working on the same app now. A declined optional action is `skipped`, and a declined optional action is not a failure. Never invent proof.

A person with the same page open in the builder is not a plan, and nothing guards against them: when they save, their older copy goes out whole and can quietly undo a task that already read back clean. When the person says a finished change is gone, read the entity live before redoing anything. If the change is missing and nobody removed it on purpose, ask whoever has the page open to reload it, then reapply only that change and read it back again.

Show the `entityTable` that `plan finish` returns at the end, and the one from `plan get` when the person asks what exists, exactly as returned. Under it, give each page's and each saved automation's best practice score from its task's `result.readBack` in `plan get`, and every `best practice exception:` line of its `result.notes` in plain words, one per line, with the page or automation it is on, the same count as the reports. One under 90 says so first. Then open the preview of a changed app or page in the Claude desktop browser pane (SKILL.md § Open the preview).

If the person says to stop because they are satisfied, stop sending and do not wait for replies. Call `plan finish <planId> --user-requested [--reason "<their reason>"] --json` at once. It changes no task status or content, needs no additional confirmation or spec approval, and skips feature upserts.

Use `plan finish <planId> --failed --reason "<hard execution failure>" --json` only when execution cannot continue: a required tool is missing, the quota is gone, or a required write is blocked.
