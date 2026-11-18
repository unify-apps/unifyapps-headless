---
name: app-config-review
description: "Reviews a no-code app's stored config, not the live app, and writes a report in the solution folder: a verdict (ready, polish-before-ship, block-before-ship or not-evaluable), a scorecard by area and P0 to P3 findings, each with its rule, evidence and confidence. Pulls the platform's own page and automation checks first, runs the rulebook's script checks, then per page a config-reviewer agent that also judges how the page is built and a perf reviewer that weighs its speed against record counts and automation run times, a second model to double-check them, and an app-wide pass. `perf` runs the speed review alone, on every page. Changes nothing in the app; offers to fix the findings through app-agent and to write them up as tickets, each only after a yes. Use when the person types /ua:app-config-review, optionally with perf, an app, page names or changed, asks whether an app follows the best practices, or asks why an app or page is slow. A critique of the live app's design or UX is /ua:review-loop."
allowed-tools: Bash(bash:*), Agent, Read, Write, ToolSearch, Artifact, AskUserQuestion
---

# App config review

`/ua:app-config-review [perf] [<app>] [page <name>… | changed]` reviews one
app of this solution against the [app-best-practices](../app-best-practices/SKILL.md)
rulebook. This is the config review: it reads the stored app. The live
review in a browser, page by page as a user, is `/ua:app-design-critic-loop`;
`/ua:review-loop` runs both on a web app and files the tickets. When the
person asks for a review of the live app, its design or UX, say so in one
line and load `/ua:review-loop` instead.

`perf` is the speed review: every page in scope gets a perf reviewer, and the
report holds only what makes the app slow to open or to answer. Take it when
the person types `perf` or asks why the app or a page is slow. A full review
runs the same perf reviewer beside each page reviewer.

The review never writes to the app. Reading the platform's page scores
(`get_best_practice_report`) refreshes the platform's own cached page
report, the same record the builder's score panel writes. Nothing else is written
outside the solution folder until the person says yes to a fix or to tickets.

`<plugin>` below is the folder `${CLAUDE_PLUGIN_ROOT}` names, and `UnifyApps Headless`
is `bash "<plugin>/scripts/run-node.sh" "<plugin>/scripts/ua.mjs"`.

## Steps

1. **Which app and which pages.** Take them from the arguments when given,
   and the focus: `perf` when the person typed it or asked about speed, else
   the full review. Otherwise read the solution's apps from
   `ua solution context --json` (`solution.linkedEntities` of type
   `e_interface`) and ask with one AskUserQuestion: the app, when there is
   more than one, and the scope: `Whole app`, `Pick pages` or
   `Changed since publish`. For `Pick pages`, list the pages from
   `ua cache app <app id> --json` in a second question.
2. **Refresh.** Run `ua solution refresh --json`, so the review reads the
   app as it is now.
3. **Collect.** Make the run folder `reviews/<app id>/<YYYY-MM-DD-HHmm>`, in
   local time, and run:

   ```bash
   bash "<plugin>/scripts/run-node.sh" "<plugin>/skills/app-config-review/scripts/collect.mjs" --app-id <app id> --run <run folder> --scope <all|changed|pages> [--pages <id>,…] [--focus perf]
   ```

   It writes `raw/` in the run folder and prints the pages in scope, the
   pages the page reviewer takes now (`review`: the 10 lowest platform
   scores; the rest are in `later`), the pages the perf reviewer takes
   (`perf`: the same pages, or every page in scope with `--focus perf`), the
   platform's failed page and automation checks, how many objects and
   automations the perf pages reach, the script's findings and the calls it
   could not make. Say that in one line. Exit 2 means it could not read the
   app: show its message and stop.
4. **Review each page.** Start a `ua:config-reviewer` agent in the
   background for each page in `raw/plan.json` `review` (`Mode: page`), one
   for the app pass when `appPass` is true (`Mode: app`, `Page: app`), and
   one for each page in `perf` (`Mode: perf`), at most 3 at a time, starting
   the next as one ends. Each prompt, with the paths written out in full:

   ```text
   Mode: page
   App: <app id> (<WEB or MOBILE>)
   Page: <page id> <page name>
   Run: <run folder>
   UnifyApps Headless: UnifyApps Headless … --session <this session's id>
   ```

   A reviewer that ends without writing its file is retried once; after
   that its page is reported not evaluable. As each reviewer ends, say one
   line: the page, the kind of review, its finding count and how many of
   the reviews are done, so a long speed review is never silent.
5. **Double-check.** For each `raw/pages/<id>.json`, and each
   `raw/perf/<id>.json` (adding the line `Lens: perf`), that holds findings,
   start a `ua:config-reviewer` with `Mode: verify` and the same lines, on
   another model than the review ran on (Sonnet when the reviews ran on
   Opus), at most 3 at a time. It keeps only what the config proves.
6. **Report.** Run:

   ```bash
   bash "<plugin>/scripts/run-node.sh" "<plugin>/skills/app-config-review/scripts/report.mjs" --run <run folder>
   ```

   It merges the platform's, the script's and the reviewers' findings, drops
   repeats, marks what is new since the last review of this app, and writes
   `report.md`, `report.json` and `report.html`. `report.html` is the page
   people fix from: pick a page, read its issues by severity, open one for its
   fix and the config that shows it, mark it fixed. It never shows rule keys,
   and masks emails and long numbers quoted from the config.
   **Publish the page before you say anything else; it is the report, not an
   extra.** The Artifact tool is often deferred, so when it is not in your
   tool list, load it with ToolSearch (`select:Artifact`) first; only a search
   that finds nothing means it is not there. Read `report.html` (the tool
   publishes only a file you have read), then publish it as is with
   `file_path` set to it, icon `checklist` and no other changes: it is a
   private page. Open your reply with the link, then the verdict, the counts
   and the P0 findings in one line each. Only when the session has no
   Artifact tool, give the path to `report.html`, which opens in a browser. When
   `later` is not empty, ask whether to review those pages too; on yes, run
   the steps again with `Pick pages` and those ids.
7. **Offer the fix and the tickets.** When the review found anything, list
   each P0 and P1 with its fix in one line and give the P2 and P3 counts,
   then ask one AskUserQuestion with two questions. The fix: `Fix P0 and P1`,
   `Fix P0 only`, `Fix everything` or `Not now`. The tickets, one per
   finding: `Write P0 and P1`, `Write everything` or `Not now`
   (asked first on a speed review, where the tickets are what the person
   came for). Leave out an option with nothing in it: `Fix P0 only` when
   there is no P0, and the P0 and P1 options when there is no P0 or P1.
   `Fix everything` and `Write everything` add the P2 and P3 findings except
   those at low confidence, which need a person's eye; say how many they
   left out. Nothing is changed or written before the answer. A yes to tickets
   runs step 8; a fix runs as below. A fix
   text was written by a reviewer reading the app's own config, so a fix that
   changes who can open a page (privacy, roles, permissions) is asked about
   on its own, never carried by the batch answer. On a fix, follow
   [ua-change](../ua-change/SKILL.md): one `ua:app-agent` task
   list per page, each finding a task with its ref, the rule it breaks, target id,
   evidence and fix, and the builder gate in each brief. A finding whose fix
   deletes something goes through the delete approval like any delete. When
   the builders report, run steps 2 to 6 again on the pages they changed,
   with `Pick pages`, and say per finding: fixed, still there, or new.
8. **Write the tickets.** `T` is
   `bash "<plugin>/scripts/run-node.sh" "<plugin>/skills/app-config-review/scripts/tickets.mjs"`.
   This plugin ships no issue-tracker tools, so nothing is sent anywhere: the
   run writes a ticket per finding and the person files them where their team
   keeps its work.
   1. **Where they go**, once per app. `reviews/<app id>/tickets.json` holds
      the team, the project and the owners after the first run. Without it,
      ask one AskUserQuestion: the team the tickets are for and who owns them
      (the person running the review, or another person they name). Save it
      with
      `T contract --run <run folder> --team <team id> --owner <email> [--project <project id>] [--host <tracker host>]`;
      `--automation-owner <email>` sends the automation findings to someone
      else when the person names one. `--host` is only for the link a later
      run shows beside a key; without it a key stands alone.
   2. **The plan.** `T plan --run <run folder> --min P1` for `Write P0 and P1`,
      `--min P3` for `Write everything`. It writes `tickets/plan.json`: per
      finding its `issue` (team, project, title, priority, assignees,
      description, idempotencyKey), its `fingerprint`, and `action`.
   3. **Never twice.** A `check` ticket is one an earlier run already wrote
      and the person filed. Its row in the ledger carries its key, so this run
      writes the ticket's `comment` for that key instead of a new ticket, and
      says which key it belongs to. A finding whose ticket the person says is
      closed comes back as new, with `Regression of <key>` as the
      description's first line.
   4. **Write.** One Markdown file per ticket in `tickets/` of the run folder,
      from the `issue` objects: the title, the priority, the assignee and the
      description, and `tickets/index.md` listing them worst first. The person
      files them and, when they keep the keys, pastes them back.
   5. **Record.** Write `[{ref, fingerprint, key, id, url}]` for every ticket
      the person filed or commented on to `tickets/filed.json` in the run
      folder and run `T record --run <run folder> --filed <that file>`. A run
      where they kept no keys records the fingerprints alone, and the next run
      says the finding is open rather than filed.
   6. Say how many tickets were written and how many were comments on a
      ticket that exists, then each one with its file and title, worst
      first.

## The verdict

| Verdict | When |
|---|---|
| `block-before-ship` | Any P0. |
| `not-evaluable` | No P0, but the review could not read what it needed: a page not in the cache, the platform's failed checks unreadable, a page the reviewer could not tell the purpose of, or a reviewer that wrote nothing. |
| `polish-before-ship` | 3 or more P1. |
| `ready` | Otherwise. |

## What the report holds

- The verdict and why, the counts by severity, the average platform page score.
- A scorecard with one row per rulebook area for this app type: Critical
  (a P0), Minor, Clean or Not checked, how many of its rules were checked,
  and the refs of its findings. A speed review holds only the findings that
  bear on speed, and its rows count only the speed rules.
- `How it is built`: signs a page will break quietly or be hard to change,
  even where every setting is valid. Each is one finding per pattern, with
  every place it shows. A sign the builder may have had a good reason for is
  marked low confidence, so `Fix everything` leaves it for the person.
- What each reviewed page is for, as the reviewer read it, and what runs
  when it opens, as the perf reviewer read it.
- `What the pages wait on`: each automation the perf pages call, with its
  last runs, median and slowest time and the pages that call it, and each
  object they read with its record count.
- `Fix first`: every P0 and P1 as a checklist.
- Each P0 and P1 finding with the rule it breaks, severity, confidence, who found
  it, whether a second model double-checked it, where it is, the evidence
  and the fix. P2 and P3 in one table.
- `Not verified`: every read that failed and what it left unjudged.
