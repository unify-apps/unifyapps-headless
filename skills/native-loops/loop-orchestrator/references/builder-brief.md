# The shared builder brief

## Contents

- Sections, in this order
- Changing the brief mid-run

When several agents work on one app at once, each gets the same brief file
plus its own issues, so a rule settled once reaches every job. The
orchestrator writes it before the first dispatch of a run that writes
(`fix`, `build`), as `R/brief/BRIEF-COMMON.md`, lints it with `native-lint`'s
`task-lint` (`node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-lint/scripts/task-lint.mjs" R/brief/BRIEF-COMMON.md --platform <MOBILE|WEB>`;
a Markdown file is linted as a brief; on WEB the phone's traps are skipped), and names its path in every brief with
"read it fully before your first write". No credentials, cookies or tokens
ever go in it.

Each dispatch is still a full UnifyApps Headless brief (`ua:ua-change` § The
brief: tenant, CLI with `--session`, work folder, the person's words, task,
current state, built so far, yes from the person). The shared brief adds what
every job must hold in common. Include [run execution](execution.md) in the
brief and supply its job checklist, recorded permissions and checkpoint.
It never replaces the per-job brief, because
Claude Code's auto mode judges a builder's calls by its prompt alone.

## Sections, in this order

1. **Target.** Tenant host and environment (as sign-in read it), solution, app
   name and id, `appType MOBILE` or `appType WEB`, what the app's navigation
   already holds (so no builder builds a tab bar inside a page on MOBILE, or a
   menu bar of buttons and links on a WEB page: the menu is
   `properties.navigation`), the UnifyApps Headless CLI with `--session <sid>`.
   **The skills the builders load, per platform:**
   - MOBILE: `app-design` with the `app-native` overlay, `app-craft`,
     `app-verify` (its device proof is the loops' queue, not the Preview app
     on its own).
   - A code app (`kind code` from `loops platform`): the builder is
     `ua:code-app-agent` with `app-code-build`, briefed as its agent file
     says (the plan task, the branch, the acceptance lines); its proof is the
     source changed, a clean `tsc -b` and the engine's green push, and the
     loops' browser checks on the engine's preview route.
   - WEB: `app-design`, `app-craft`, `app-verify`. Never `app-native`: its
     rules are for the mobile renderer and are wrong in a browser (no safe area, no
     Pressable feedback, no keyboard-aware ancestor). A WEB page's look holds
     at the design width (1440) and the second width (375); custom CSS goes on
     a block as `[data-block-id='<id>']` only where app-craft's custom CSS
     rules allow it.
2. **What the person asked**, verbatim, and the deadline if any.
3. **Design source.** The design store path (`design/<app-id>/design.md`), the
   app look in one line (font, colour roles, radii, gaps, type scale), and the
   known inconsistencies its `notes` list, not to copy.
4. **Hard rules**, numbered:
   1. Rebuild in place: keep the page id, slug, path and declared page inputs
      (other pages and AI agents open it by id); replace placeholder or
      hard-coded blocks with blocks bound to real data; remove only the dead
      blocks you replace.
   2. Automations and objects: unchanged in a page, module or card job
      (inputs, outputs, code, deploy, schema, records): an automation change
      belongs to its automation job, which the orchestrator briefs on its own.
      Reuse the page's data sources; a new source may call an existing
      automation or read an existing object; never delete a source.
   3. Identity: never add a user id, email or account number as a data-source
      parameter; the automation reads the signed-in user from the server
      (`ua:ua-secure-by-default` rule 2). Leave existing ones to the
      security check.
   4. Data: bind to the real output schemas, never to the design's sample
      people, numbers or dates; every list and number has an empty state
      worded as the design words it.
   5. Drafts only. No publish, no deploy; the person approves releases. An
      automation job is the one exception: its task body says to deploy once
      the test run after passes (on a tenant that said it is UAT at sign-in;
      elsewhere only on the person's yes, sent to it), and an
      AI agent job publishes only on the person's yes, sent to it in their
      words.
   6. Ownership, by the blocks you write, not the page version. The page
      version moves with every save by anyone, so it is never the test.
      Just before each write, read the live page and compare each TARGET
      block (the blocks this job writes) with the before-value the brief
      carries (its hash in the drift snapshot). Same: write, and report the
      page version you saw. Different: stop and report the block and who
      saved it. A save under an hour old by someone else stops you only when
      it touched a target block; a save that moved only other blocks is no
      reason to stop. Block-level edits only
      (`drift.mjs check <pageId> --app-id <appId> --since <the job's snapshot> --targets <block ids>`,
      `native-lint` drift).
   7. Touch feedback: every tappable you add or touch gets the feedback its
      surface calls for (`app-page-quality` rulebook U1), and every chain that
      calls a source or submits shows it (X2). On WEB: every control has a
      hover look, a visible focus indicator and a pointer cursor, and the
      keyboard reaches it (web-browser W1–W6); every image has alt text,
      every field a label, every text AA contrast (W7–W11).
   8. Words: statuses as words, text in the person's words, no record ids,
      field names or error codes on screen.
   9. Proof first: write only for an issue whose job file shows it was
      reproduced on a device (its `device` cell `device` or `run`, or its
      `steps`) or whose cause you prove yourself by a read-back before the
      write (the block, source or run line quoted in your report). An issue
      with neither is not drafted: report it as `needs repro: <the one
      question that would unblock it>`.
   10. The run folder has one owner per job. Before each write into `R`
       (an issue log, a steps file, a shot, your own job-state step), re-read
       `R/jobs/<job>/state.json`. When its `agent` is no longer the name your
       brief gave you, the orchestrator has taken the work over: write
       nothing, append one line to the run log
       (`loops log append --run <R> '{"type":"error","job":"<job>","error":"taken over; wrote nothing"}'`)
       and end.
5. **Page ids for navigation** (name → id → slug), and **state passed between
   pages** (`state · <App>: <what> in page input <name> (<format>) · written by
   … · read by …`).
6. **Shared modules and cards** from `scope.json`: which job owns each, and
   that no other job edits them; a page job that needs a change there writes
   it under `## Notes for the orchestrator`.
7. **Proof.** After the writes: the live read-back lines, the bound sources
   read back, the device request ids queued for this job (or "not checked on
   a device"), and anything not matched with the reason. The report is a
   fix report ([formats](formats.md) § Fix report of a job). A
   builder never opens a simulator or a browser for the loop's proof: the
   orchestrator queues the retest (on WEB with `--platform web`), after
   `loops cache-export` of the page it wrote.
8. **Device-proven traps**: link [device traps](device-traps.md) and copy the
   traps that touch this app's blocks (most D traps are the phone's; on WEB
   copy the ones § On WEB names, the automation traps and any WEB trap a test
   runner proved). Add a trap here the
   moment a test runner proves one, with the draft version it was seen on.
9. **Colour and token rules** when the app has a theme: which token names to
   write, in which form, and that a hex is never used for anything that differs
   between light and dark (D08 gives the forms that work on MOBILE).
10. **Special page families** (in-chat card pages, sheets): their shell, what
    must not change (inputs, page events, exact message texts the agent routes
    on, D12), their geometry.

## Changing the brief mid-run

The brief is one file. A new rule is appended as a dated section headed
`UPDATE <yyyy-mm-dd hh:mm> (supersedes <section>)`; nothing above it is
edited, so an agent that read the file an hour ago sees what changed. Then
every running job gets one message (`SendMessage` to its agent id): "re-read
BRIEF-COMMON.md from `UPDATE <time>`". Ownership changes (a teammate hands
pages over, or takes some back) are always such an update. Each update is a
`dispatch` event in the run log.
