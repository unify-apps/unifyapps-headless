---
user-invocable: false
name: ua-change
description: "Builds changes to a UnifyApps solution from the main session — directly in chat, by calling the UnifyApps Headless MCP tools or by briefing the builder agents (fde-agent, automation-agent, app-agent, agent-builder, code-app-agent, graph-agent) to work in parallel, then checking every read-back and linking what was made to the solution. Also runs a plan made with /ua:plan, and resumes and finishes one. Use for every change request in a UnifyApps Headless solution folder: it first hands the change to the loop that fits, and builds it directly only when the person said not to use a loop or no loop fits."
allowed-tools: Bash(bash:*), Read, Write, Edit, Agent, Task, Skill, AskUserQuestion
---

Load `ua-safety` before your first tenant read.

# Build a change

Every command runs as `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-node.sh" "${CLAUDE_PLUGIN_ROOT}/scripts/ua.mjs" <area> <command> ...` with `--json`.

A change asked in chat goes to its loop first (§ Loop first). A plan exists only when the person asked for one (the `plan` skill), and then § Run a plan applies.

## Loop first

A loop builds a change and proves it: pages in a browser or on a device, an AI agent with test messages, an automation with test runs. So every ask in chat to build, change, fix, scope, test or review something goes to one, unless a case in step 5 holds. Skip this section when a loop, a plan or `ua-debug` brought you here, or the person typed a `/ua:` command.

1. **The verb.**

   | The ask | Verb | Front door |
   |---|---|---|
   | Something new, added or changed | `build` | `ua:build-loop` |
   | Something broken, wrong or slow | `fix` | `ua:repair-loop` |
   | A PRD, tickets, or scoping a new app or feature. A plan of work in this chat is the `plan` skill, and only when asked. | `scope` | `ua:scope-loop` |
   | Test cases or a test run: `--mode discover` to write or review cases, `build` to automate them, `run` to run them | `test` | `ua:test-loop` |
   | A design or UX review | `review` | `ua:review-loop` |

2. **The thing.** Name the app, AI agent or automation the ask is about, as the person gave it: its name, id or link. Otherwise the ticket key or Figma link; when the ask names an app and a link, pass the app. Never pass the whole sentence while it names a thing: the lookup matches a name, not the words around it. `cache app|agent|wf "<name>"` confirms a name you are unsure of. When the ask names no thing, pass the whole ask with the kind of thing you read it to be: [which loop](../native-loops/loop-orchestrator/references/which-loop.md) lists the kinds (`app`, `automation`, `ai-agent`, `content`, `object`, `unknown`) and when each fits. Never guess: an ask that could be two kinds is `unknown`, and the person is asked.
3. **Resolve it.** Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-node.sh" "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-orchestrator/scripts/loops.mjs" target "<the thing>" --verb <verb> --json`, with `--mode` for `test`, and `--kind <kind>` (and `--app "<name>"` for an app) when you passed the whole ask.
4. **Hand over.**
   - It names a `command`: load `ua:<command>` with the Skill tool.
   - `target` is `ticket` or `design`, or a `test` ask has no clear mode: load the verb's front door from step 1, whatever the `reason` says. It reads the ticket or the frames, or picks the mode, and names the loop.
   - No `command`, and the `reason` names a `/ua:` loop: load that loop.

   Follow the loop with the person's whole ask, from its first step to its end. Say in one line which loop took it and why, from `target`'s answer.
5. **Build it directly** only when:
   - the person said not to use a loop ("no loop", "skip the loop", "do it directly"). "Just do it" alone means go ahead, not skip the loop;
   - `target` answers `unknown` for the thing's name, or for the whole ask when it names no thing. Its `reason` and `ask` then say to ask the person: that is for a front door the person typed; here, build directly. For an app link it does not know, run `solution refresh` and try once more first;
   - the ask is about something no loop builds (an object, a connector, an environment variable, a role), or the `reason` says no loop builds it and names no other loop;
   - `target` fails.

   For a fix, find the cause with `ua-debug`, then follow § Build it directly; for anything else, § Build it directly. Say in one line why no loop runs it. Never ask the person which loop to use.

## What to know before you build

| Need | Where |
|---|---|
| The tenant and its environment, the workspace, the solution, memory, other work | `solution context --json`, once per session |
| The reads, cheapest first | [quick-scope.md](references/quick-scope.md) |
| Values the request does not give | [defaults.md](references/defaults.md). Name each one you used. |
| The order of work and what to check first | [order-of-work.md](references/order-of-work.md). A missing item is one more piece of the work. |
| A target not in this solution | [entity-membership.md](references/entity-membership.md) |
| Which builder makes each change, which read proves it, what no tool can do | [task-kinds.md](references/task-kinds.md) |

A change that creates or changes a context graph loads `context-graph-design` first: it settles the design, and splits the build into the graph stages and the graph's AI agents, in the order [order-of-work.md](references/order-of-work.md) gives.

A new page of a no-code app, or one whose layout changes, loads `app-page-planner` for its job and design lines, and its builder gets them. A change to colours, text or one setting does not. A page with a job is judged by a second agent once its layout is built (§ Page review).

## Build it directly

1. **Split** the change into pieces, one per entity, and note which piece needs another's result (an object id, a deployed automation, a new page's id).
2. **Start** every piece that waits on nothing, all in one message, with at most 6 builder agents at work at once in this session, a running plan's included: each one spends its own tokens, and ten at once ran a session into its usage limit. A piece past that starts when a builder reports. A small piece (a name, a setting, one field on one entity) you may do yourself with the MCP tool. A larger piece goes to its builder agent, in the background:

   ```text
   Agent(subagent_type: "ua:<fde-agent|automation-agent|app-agent|agent-builder|code-app-agent|graph-agent>", run_in_background: true,
     description: "<agent>: <entity name>", prompt: <the brief below>)
   ```

   Before each one, run `task update --sent "<the piece>" --entity "<name or id>" --agent <agent>-<entity slug> --json`. It records the piece and makes that builder's own work folder, which goes in the brief. Keep the agentId the `Agent` call returns: an answer or a fix goes back to that agent.

3. **Pass results on.** When a piece reports, start what was waiting on it, with the ids it reported. Its notification shows the tokens the builder holds: send a follow-up on the same entity to that builder with `SendMessage` while it holds under 250k, so it skips reading the page and its sheets again. Above that every turn re-sends it all (a page builder at 490k took 34 s to its first call and 14 s a turn), so start a fresh builder instead, with a handoff in its brief: the ids it needs, the block ids and what the last builder changed.
4. **Check** each report's read-back lines, and its `Change check:` and `Ripple:` lines when it changed an existing entity (`ua-safety` § For the router), then record it: `task update --done "<what now exists>" --entity "<name or id>" --read-back "<the read-back line>" --json`. The command refuses a line that does not name the entity. A piece with no read-back is not done: read it yourself, or send it back once with what is missing. An object or automation piece with no `speed:` line goes back once the same way. Each `index needed:` line is one more piece of the same change: brief `fde-agent` with the object, the fields and the read that needs them, and say in one line that you are adding the index. A builder that stopped with no report (a usage limit, a stall): read live what it touched, then send the piece again once, with what already exists in `Built so far`. After a usage limit (an HTTP 429, or a stop that says the limit was reached), wait until it resets before you send again; that stop does not use up the piece's one resend.
5. **Read back** each new entity: `entity read <kind> <id>[,<id>…] --source build --json` (a page with `--app-id`, a code app as `code-app`). UnifyApps Headless links every app, code app, object, automation, AI agent and connection to this solution when a tool call creates it. This read caches each one, and links any whose link failed (the create call's reply says so). A connection cannot be read this way: when its link failed, tell the person to add it to the solution in UnifyApps. An API Platform record, an environment variable, a custom connector, a knowledge set and a context graph are never linked; their row in the table (kind `knowledge-set` for a set, `graph` for a graph) is how the person finds them.
6. **Tell the person** what exists now. When the request was to fix, debug or explain why an app, page, automation or object is "not working", lead with § Fix report, before anything else. Then the table `entity link --refs '<json list of {kind, id, name, appId?, status?}>' --json` returns for every entity of the change in one call, what was deployed or published, and what is unverified. Show every unverified line that starts `Security:` in plain words, one per line, as what an admin or the person must still do; a missing security control is never left for `details`. **Scores and exceptions.** Give each page's and each saved automation's best practice score beside its name, and copy every `best practice exception:` line from the builders' reports (each task's `notes` in `plan get`, or the builder's closing report in chat) into your reply, one per line in plain words with the page or automation it is on. Keep the same count as the reports, including at 90 or more. One under 90 says so first. A `Best Practice score not read:` line is shown too. Then [open the preview](#open-the-preview) of a changed app or page.

**Fix report.** When the request was to fix, debug or explain a bug, an error or something "not working", the final message gives this shape, short and in plain words, before the entity table — a bare "this is done" tells the person nothing they can check:

- `What was wrong:` the root cause, one or two sentences, with the evidence that showed it — the run id, the failing step or the config line, from a real read or run this session, never a guess.
- `What I changed:` one line per change — `<entity>` — `<before>` → `<after>`.
- `How I checked:` the re-run or read-back UnifyApps Headless did and its result — an automation run id from `trigger_workflow_run` / `inspect_workflow_run`, or a page read-back, named exactly as the tool answered. When none was possible, say `Not verified: <why>` instead; never claim a check that was not made.
- `How you can check:` numbered steps that end at the entity's own link from `entity link`, so the person opens the right page or run, then what to do and what they should see.

**Suggest how to test it.** A change to an existing entity ends with `How to test it:`, numbered steps the person can follow, each one what to do and what they should see. Start with the changed part, then each `Ripple: wider` reader, then each `Not re-checked:` line still open. A page or app step runs in the preview that [Open the preview](#open-the-preview) shows: its `preview` link from `entity link`, never the live app. An automation step is a test run with an input you name. An AI agent step is a question it should still answer the same way. When no stored row would show the change (no row has the value the change hides or shows), say so and give the row the person would add to see it. A fix's `How you can check:` is this list. Then offer, in one line, the next step that fits: run the steps yourself in the preview pane and report what you saw, run the app's Test Studio suites once it is published, or, when no Test Studio case covers the changed page, turn the steps into cases with `/ua:app-test-create-loop`.

Carry these facts from whichever builder did the work — its chat-task report (§ The brief, below) names `root_cause`, `before`/`after` per change and `proof` the same way, so this quotes its reads rather than inventing them.

**The brief.** Claude Code's auto mode judges a builder's calls by its prompt alone, so the prompt carries everything:

```text
You are <agent>-<entity slug>, a UnifyApps Headless builder agent — the exact name task update --sent just minted. Use it as `agent` on every knowledge read and write: a name shared with another builder shares one knowledge list and can lose sheets it already read.
Tenant: <host> (environment <env>). Solution: <name> (<id>).
App: <name> (<the app's own id, never the solution id>) — only on a task that touches an app, a page or a code app.
UnifyApps Headless CLI: node "<the CLI path from CLAUDE.md>", with --session <this session's id, the folder after .sessions/ in the work folder> on every command.
Work folder: <the workFolder task update --sent returned>. Write every file of your own there.
The person asked in chat: "<their words>".
Task: <what must be true when done, in names, ids, fields, codes and values from your reads>. On an existing entity, only what the request points at.
Keep: <on an existing entity, what the person relies on that must still work, or none known>.
Current state: <the read you made, or the cache command that gives it>.
Built so far: <ids from earlier pieces, or none>.
Yes from the person: <a deploy, publish or delete they asked for, in their words, or none>.
<on an object or automation piece: Speed: waits <who waits on it: a page on open, a person after a click, another automation, or no one> · runs <how often, from the ask or its runs, or unknown> · size <the records it reads now and the growth the person named, or unknown>. End with the speed: lines your speed skill names.>
<if the task fixes, debugs or explains a bug: Fix report: carry root_cause (with its evidence), before/after per change and proof (a real tool result this session, or "not verified" with why) in your report, the same shape as § Fix report.>
End with the chat-task report your instructions name.
```

Follow [task-kinds.md § Facts every body follows](references/task-kinds.md#facts-every-body-follows) in every task line.

**Releases.** This is the one rule for chat work; other files point here. Deploy a new automation when the request needs it working. Before you deploy a change to one that pages, AI agents or other automations already call, ask: their users get it at once. Publish an app or an AI agent when the person asked for it, or ask first: a publish changes what its users see. A delete always asks: the tool answers `CONFIRM_REQUIRED (d_…)` until the person says yes in a dialog (§ Answers and blocks). Adding a new entity or linking one to the solution is not silent: state the plan in one line before doing it, then go on. Posting to an outside tracker is not unasked: state it and wait for the person's yes before you do it. Never re-ask a choice the person already stated clearly earlier in this conversation — state the planned action once and go on, and ask only when something is genuinely still unclear.

**Secret values.** This is the one rule for a secret the person gives; other files point here. When the person gives an environment variable's secret value in chat, save it yourself at once with `save_env_variables` (load `env-variables`): `sensitive: true`, then check `saved` and that `created` is what you meant. Never put the value in a task, a plan, a spec, a builder's brief or a reply, and never repeat it. A builder that needs a secret the person has not given reads the variable by name and reports the `Security:` line.

**Answers and blocks.** A builder never asks the person. Its report may hold a question, a `CONFIRM_REQUIRED (d_…)` line, `Blocked by auto mode`, or a line naming the `AGENT_LLM_TOOLS` permission, which only a tenant admin can grant: tell the person once and send that builder nothing until they say it is granted, or once more after a minute when they say they already hold it. Ask the person with AskUserQuestion; for a delete, put the line's summary and its `(d_…)` id in the question as the line gives them. Several deletes may share one question, each as its own summary and id: a yes approves all of them only when every one is shown, and a no drops them all. Then send their answer, in their own words, to the same builder with `SendMessage` and its agentId, and it makes the same call again. When `SendMessage` is missing, start a new agent with the same brief, the answer, and `Built so far`. Never make a refused call yourself, and never pass on a bare yes. For `Blocked by auto mode`, also name the permission change only the person can make, as [run-loop.md](references/run-loop.md) § Rules words it, and once they made it, send the answer to a new agent with the same brief, the answer and `Built so far`, never to the refused builder: it keeps the permission mode it started with and refuses again. A call with `dryRun: true` deletes nothing and asks nothing: run it first, so the question names what goes. A key a tool shows once (an API key, an OAuth secret) is written by the bridge to a private file, whose path the reply gives as `secretFile` or a builder's `Key file:` note: tell the person that path, and never open the file or print the key.

**Many items.** Count before you split: items times calls. When the same tool call repeats on 10 or more items and no tool takes a list (`apply_object_batch` and `apply_record_edits` do), write one script in your work folder. Do not brief builders per slice of the list. The script imports the tool caller whose path the guide in CLAUDE.md names:

```js
import { openTools, forEachItem } from '<tool-calls path>';
const tools = openTools('<server>');            // automation-code, object, application-builder, ...
const found = await tools.call('<list tool>', { /* ... */ });
const todo = /* the items that still need the change */;
console.log(`${todo.length} to change`);
if (process.argv.includes('--apply')) {
  const results = await forEachItem(todo, async (item) => {
    // read the item fresh, skip it when it no longer needs the change, change one thing, save it
  });                                            // 4 at a time; one failure never stops the rest
  console.log(results.filter((r) => !r.ok));
}
await tools.close();
```

- Every call goes through the same bridge as your own tool calls: the same tenant, sign-in, delete gate and `UnifyApps Headless` tag. A delete still waits for the person's yes.
- Print counts and the failed items only, never item bodies, so nothing large comes back to you.
- Run it without `--apply` first and tell the person the count. Then run it with `--apply`, and once more without it to show nothing is left.
- The script decides each item from its own fresh read, right before it changes it, never from an earlier list or a builder's report.
- Keep the change to what was asked. A release of many items (deploy, publish) follows § Releases like any other.
- A script in another language (a Python test runner) runs its calls in one process with `node <tool-calls path> <server> --batch <calls.json>`: the file is a JSON list of `{"tool": "...", "args": {...}}`, run 4 at a time, and it prints one JSON line per call (`index`, `tool`, `ok`, then `value` or `error`). Never start one process per call: each start costs about 2 seconds.
- Builder agents are for work that needs judgement on each item: a page's design, an automation's logic.
- A script you had to write means a tool is missing. Note it for § Finish step 6, naming the tool or the list input that would have made it one call.

**Track it.** `task begin --request "<the request as typed>"` when you start, `--sent` when a piece goes to a builder, `--done` with `--read-back` after each checked read-back (a piece you made yourself too), and `task end` when done or `task end --status stopped`. The moment the person corrects or chooses something — an object over another, "no code nodes", a naming or style rule for this change — record it at once, in one line: `task note --decision "<their correction or choice>" --json`. A question still open for them, or the assumption you made in its place, the same way: `task note --question "<the question or the assumption>" --json`. Both survive a compaction; done entities already do, through `--done`.

**Page review.** Brief a page's builder to lay it out and bind it in the same run when the objects and automations it uses already exist; otherwise send it the bind as soon as they do. It takes its two shots of the bound page, with real data. Then brief `ua:page-reviewer` in the background with the job, the design regions, the app look, the page and app ids, and those two shot files; never what the builder said it saw. Each finding is `blocks` (a person would hit it) or `polish` (taste). One review per page: send only the blocking findings back to the same builder, which fixes them and checks its own shots; no second review runs. Publish when every page passed or its blocking fixes are done. Keep the polish for Finish.

**The builder gate.** An app-agent page task is done only when its `readBack` says `gate: pass`. A report without a `gate:` line goes back to the same builder once to run it. `gate: fail` comes back as `needs_confirmation` with the findings: tell the person each one and ask whether to fix it or keep it. `gate: not run` comes with its reason in `unverified`: say so in the summary and do not send the task back for it. When you change a page yourself, run the same two checks, as `app-verify` § The config self-check says.

**A new message while builders work** is judged like any message: answer it, or start its work too when it does not touch what is being built. Say in one line what is still running.

## Run a plan

A plan made with the `plan` skill is saved and started there. Its tasks follow [tasks.md](references/tasks.md), and a Sonic plan's short spec [short-spec-template.md](references/short-spec-template.md). Follow the send loop in [run-loop.md](references/run-loop.md): `plan ready --mark` writes every builder message from [dispatch-template.md](references/dispatch-template.md) and names the exact calls to make. Copy them; never write a plan message by hand. When work grows during the run, sort it by [grill.md § 2](../plan/references/grill.md) and [run-loop.md § Plan changes](references/run-loop.md).

**Page quality.** A plan that built a page of a MOBILE app holds that app's publish until the page quality pass is settled. When `plan ready`'s `next` is the one line `Run the page quality pass …`, load `app-page-quality` and follow its § Procedure, and never confirm a publish that `heldForQuality` names. The pass ends with one line: `Page quality: <n> pages, <b> blocking, <a> advisory accepted`.

Resume: a resumable plan whose reason is `not-started` starts with `plan start <planId> --json` after the person says go on. Any other resumable plan: `plan resume <planId> --json`, then the run loop.

## Finish

1. Name each hard error and any useful correction.
2. Memory: the whole team reads it, so save only what the work's records do not already say and a teammate would need (a choice with an unrecorded reason, a correction the person made, an unexplained failure, a tenant fact). One `memory remember <section> "<line>" --json` per fact (add `--plan <planId>` for a plan), and tell the person in one line what you saved. Save nothing when nothing qualifies.
3. For a plan, upsert each changed feature with `feature upsert --file <json> --json`, in the shape of [feature-template.md](references/feature-template.md), and show the `entityTable` that `plan finish` returned. Each page the quality pass audited gets the line `Page quality (<date>): <b> blocking, accepted: <rule and block per accepted finding, or none>` in its feature doc.
4. When the plan fixed, debugged or explained a bug, lead with § Fix report, one per fix task, from its `root_cause`, `before`/`after` and `proof`. Say what exists now, as the table with each entity's link, then [open the preview](#open-the-preview) of a changed page, then `How to test it:` as § Build it directly gives it. Say what is left, with every `Security:` line from the reports, and each page's and each saved automation's best practice score with every `best practice exception:` line, never dropping one. When the reviews found polish, list it under the table, one short line per item, and offer to apply it; never apply it unasked.
5. Say what you only know from platform knowledge, not from a tool result, as such. Offer a next step only when one is likely, in your own words.
6. When UnifyApps Headless itself got in the way ([run-loop.md § Improvement feedback](references/run-loop.md#improvement-feedback) says what counts), end the message with one short line per issue and offer `/ua:give-feedback` to report them. File nothing yourself: a report reaches the UnifyApps Headless team only when the person runs that command. For chat work the sources are the builders' reports and what you saw yourself.

## What the person sees

Short progress lines while builders work, then the outcome with links. Never tool names, file paths or internal values. `details` reads the technical trail back from `task get` or `plan get`.

## Open the preview

When a change built or changed an app or a page (a no-code app, a code app, or a page of either), the person wants to see it. In the Claude desktop app, a link in the chat opens their own browser, not the app's browser pane. So open the preview in the pane for them, right after the table:

1. **Find the tool.** It is `mcp__Claude_Browser__preview_start` in a desktop session, and `mcp__remote-devices__Claude_Browser__preview_start` in a cloud session linked to the desktop. When the tools are deferred, load them all in one `ToolSearch` call whose query is the prefix (`mcp__Claude_Browser__` or `mcp__remote-devices__Claude_Browser__`, `max_results: 64`). When only `enable__mcp__remote-devices__Claude_Browser` is present, call it first; the tools appear after it. With none of these (the terminal), skip this section: the links in the table are how the person opens them.
2. **Open one page.** Call `preview_start` with `url` set to the `preview` link of the last page the change touched, or of the app when no page row has one (a new app, a `code-app` row). One call, not one per row. The app link opens its default page; a page link opens that page. A `code-app` row's link is its latest build on `main`, so it answers 404 until the code app has been built once.
3. **Make sure the pane shows.** Call `tabs_context`. Its result ends by saying whether the Browser pane is displayed, hidden or not open. When hidden, tell the person once: press Cmd+Shift+B (Mac) or Ctrl+Shift+B (Windows), or click the globe icon in the side panel.
4. **Sign-in.** The pane keeps its own sign-in. When the page shows the tenant's sign-in screen, ask the person to sign in there once; it stays signed in for later sessions.
5. **Later rows.** Under the table, add one line: "Say `open <number>` to see one here." When the person asks for a row ("open 2", "show me the invoices page"), open its `preview` link with `preview_start`, or its `url` when it has none.

Say in the chat which page the pane shows, since the person may not have been watching it.
