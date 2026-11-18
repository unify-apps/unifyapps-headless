---
name: app-test-affected
description: Finds the Test Studio UI tests a code app pull request can change and runs exactly those on the PR's Vercel preview link. Reads the PR for its branch, head commit, changed files and preview link, downloads the branch from Code Builder, follows every changed file through the app's imports to the routes its router declares, picks the cases whose steps visit those routes (every case when a file all pages share changed), runs them, and writes a report that marks each red as new or already failing before the PR. Changes nothing in Test Studio, in Code Builder or on the PR. The person starts it by typing the slash command with the PR link, optionally followed by the preview link. Use when asked which tests a code app PR affects, to test a PR or a branch preview before merging, or to run the tests a change touches rather than the whole suite.
argument-hint: "<PR link> [<preview link>]"
---

# The tests a code app PR affects

A code app's pages are the routes its router declares, and Test Studio records the pages each
case visits. So a PR's effect on the tests can be read from the code: a changed file reaches
the routes whose pages import it, and a case is affected when it visits one of them. This skill
reads the PR, works out that set with a script, runs exactly those cases on the PR's preview,
and reports what the PR broke.

The selection is the script's, never a judgment: it reads the checkout, the PR's changed files
and the saved cases, and it says why each case was picked.

## Where it runs

In the main session, in a solution folder signed in to the tenant (`/ua:setup`):

- `/ua:app-test-affected <PR link>` — the preview link is read from the PR.
- `/ua:app-test-affected <PR link> <preview link>` — the person's link is used as given.
- A request in words ("run the tests my PR affects", with a PR link) starts it too.

It needs the `app-testing` server and no browser. With the GitHub CLI (`gh`) signed in to the
PR's host, it reads the PR and its code from GitHub, so a branch made anywhere works. Without
it, section 1 asks the person for the branch and the preview link, and the code comes from
Code Builder (`code-builder` server), which knows only branches it has fetched.

## What it never does

- It never writes to Test Studio: no case, element, suite, plan or test user changes.
- It never holds, pushes, restores or publishes the code app, never builds or edits the
  checkout, and never runs git in it.
- It never comments on, approves or merges the PR.
- It never runs the cases on the live app without the person's yes (section 6).
- It never adds or drops a case by hand. When the person wants others too, that is a second
  run they ask for.

## The run folder

`<working folder>/tests/<app slug>/affected/<PR number>-<first 7 characters of the head
commit>/` (`<run>`), where `<app slug>` is the app's name, lowercase and hyphenated, as the
other Test Studio skills write it. It holds `pr.json`, `changed.json`, `cases.json`,
`elements.json`, `affected.json`, `executions.json` and `report.md`. Every tool reply the
script reads is saved there verbatim; a reply too large for the chat is one Claude Code saved
to a file, so copy that file.

The script is `node "${CLAUDE_PLUGIN_ROOT}/skills/app-test-affected/scripts/affected.mjs"`
(`affected.mjs` below). The wait between polls is
`node "${CLAUDE_PLUGIN_ROOT}/skills/app-test-author/scripts/loop.mjs" pause --seconds 20`
(`pause` below), in the foreground: never `sleep`, and never end the turn to wait.

**Progress.** After each numbered step, say one line in chat with its result (`PR #12:
6 files changed on badge-colours`). A statement, never a question.

## Before the first call

Load every tool with one ToolSearch:
`select:mcp__plugin_ua_code-builder__get_code_app,mcp__plugin_ua_code-builder__get_branch_codebase,mcp__plugin_ua_code-builder__list_code_app_versions,mcp__plugin_ua_code-builder__compare_code_versions,mcp__plugin_ua_app-testing__derive_matrix_url,mcp__plugin_ua_app-testing__fetch_test_cases,mcp__plugin_ua_app-testing__search_elements,mcp__plugin_ua_app-testing__run_test_cases,mcp__plugin_ua_app-testing__fetch_test_case_last_execution,mcp__plugin_ua_app-testing__fetch_run_executions`.
Keep the `run_test_cases` schema it returns: 6.2 reads it. A call refused with
`NOT_STARTED` or `AUTH_EXPIRED` means the folder is not signed in: load the `setup` skill
yourself, then call again once.

## 1. The PR

1. Read the link: `https://github.com/<owner>/<repo>/pull/<number>`. Anything after it that
   starts with `https://` is the person's preview link.
2. Check the CLI: `gh --version`, then `gh auth status`. When both answer:
   - `gh pr view <PR link> --json number,title,url,state,headRefName,headRefOid,baseRefName`.
     A PR that is `CLOSED` and not merged: say so and stop. A `MERGED` one goes on; say it is
     merged.
   - The changed files are read in 3.3, once the run folder exists.
3. Without the CLI, without a sign-in, or for a PR that is not on GitHub: ask the person once,
   in one message, for the PR's branch name and its preview link. The changed files then come
   from Code Builder (3.3): they are the changes since the live version, not only this
   PR's, and the report says so in a note (section 7).

## 2. The app

1. The code app the PR belongs to: the app the person named, else the solution's apps
   (`bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-node.sh" "${CLAUDE_PLUGIN_ROOT}/scripts/ua.mjs" entity context solution --json`)
   whose `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-node.sh" "${CLAUDE_PLUGIN_ROOT}/scripts/ua.mjs" cache app <id> --json` answers `mode` `code`. One such app: that one. Several:
   ask which with AskUserQuestion, the one whose name matches the repository first. None:
   ask the person for the app.
2. The app's name in that `cache app` answer gives `<app slug>`. Without the CLI only:
   `get_code_app {appId}`; `gitLinked` false means Code Builder holds no branches of this app:
   say so and stop.
3. The platform screen URL is `https://<tenant host>/p/0/interfaces/<appId>/tests/test-cases`:
   a code app's id is the id Test Studio files its cases under, and
   `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-node.sh" "${CLAUDE_PLUGIN_ROOT}/scripts/ua.mjs" solution context --json` names the tenant. Every app-testing call takes it as `url`.
4. `derive_matrix_url {url}` answers the deployed app's URL: the address the cases were
   recorded on, which the script needs to read their pages.

## 3. The checkout and the changed files

1. Make `<run>`, and write the PR view from section 1 to `<run>/pr.json`; without the CLI, the
   link and the branch the person gave, as `{"url": …, "headRefName": …}`.
2. The source at the PR's head commit (`<localPath>` below):
   - With the CLI, from GitHub, never from Code Builder (the branch may never have reached
     it):
     `mkdir -p <run>/source && gh api "repos/<owner>/<repo>/tarball/<headRefOid>" | tar -xz -C <run>/source --strip-components=1`.
     `<localPath>` is `<run>/source`, the repository's root; the script finds the app's
     folder in it. The download fails: say so and stop.
   - Without it: `get_branch_codebase {appId, branch}` with the branch the person gave. It
     writes the branch's source to the working folder and answers `localPath` and `head`.
     Code Builder refuses the branch: call it without `branch` (the default branch), with a
     note for the report that the imports were read there.
3. The changed files, saved to `<run>/changed.json`:
   - With the CLI:
     `gh api --paginate "repos/<owner>/<repo>/pulls/<number>/files?per_page=100" --jq '.[] | {filename, status, previous_filename, patch}' > <run>/changed.json`
     (100 is the largest page GitHub serves).
   - Without it: `list_code_app_versions {appId}`, then
     `compare_code_versions {appId, branch, publishedVersion}` with the branch and the first
     `published` version (the live one), saved verbatim. An app never published has no live
     version: compare with `commit` set to the default branch's head, which `get_code_app`
     answers.
4. `affected.mjs routes --checkout <localPath>` lists the routes the router declares. An
   empty list means no page can be told from another, and every case will be picked: say so.

## 4. The cases

1. `fetch_test_cases {url, limit}` with `limit` 500. When exactly 500 come back, call again
   with the limit doubled, until fewer rows come back than asked. Save the last answer
   verbatim to `<run>/cases.json`. No case at all:
   say the app has no tests yet (`/ua:app-test-create-loop` writes them) and stop.
2. `search_elements {url, limit, offset}` with `limit` 50, from `offset` 0 up in steps of
   50, until a page comes back with fewer than 50; every page saved, in order, as one JSON
   array in `<run>/elements.json`. It tells the script which page each element a step uses
   is on.

## 5. The selection

```
affected.mjs select --checkout <localPath> --changed <run>/changed.json --cases <run>/cases.json --elements <run>/elements.json --app-url <deployed app URL> --out <run>/affected.json
```

It prints the counts and writes `affected.json`: what each changed file reaches (some routes,
every page, or nothing, with why), the routes reached, and the cases. `ids` is the list to
run: the cases that visit a reached page, and the ones whose steps name no page of the app,
which run too because nothing shows they are safe to leave out. When no changed file
reaches anything the app loads, no case runs, those included. A case with no compiled
script is listed under `cannotRun` and is not run. A non-zero exit prints why: show it and
stop. Once it has run, delete `<run>/source` (the GitHub download): nothing reads it again.

`ids` empty means the PR reaches no page any case visits: write the report without
`--executions` (section 7), tell the person nothing needs running, and stop. That is a pass.

## 6. The run

1. **The preview link.** The person's link when they gave one. Otherwise the PR's own
   preview deployment of its head commit:
   `gh api "repos/<owner>/<repo>/deployments?sha=<headRefOid>" --jq '.[] | {id, environment, created_at}'`,
   the newest whose environment starts with `Preview`, then
   `gh api "repos/<owner>/<repo>/deployments/<id>/statuses" --jq '.[0] | {state, environment_url}'`.
   - Success: its environment URL is the link.
   - Pending, queued or in progress: the preview is still building. `pause`, read the status
     again, at most 15 times (5 minutes); still not a success, say the preview is not ready
     and stop.
   - Failure or error: the preview did not build for this commit. Say so with the PR link and
     stop.
   - No deployment: the link in the Vercel bot's comment on the PR,
     `gh pr view <PR link> --json comments --jq '.comments[] | select(.author.login | startswith("vercel")) | .body'`.
     Take its Preview link, never a `vercel.com` link (that one is the Inspect page). It may
     be the branch's own address, which serves the branch's newest build.
   - Still none: ask the person once for it.

   Then `curl -s -o /dev/null -w '%{http_code}' <link>`. No answer, a 404 or a 5xx means
   there is nothing to run on: say so and stop. A 401 or 403 means the preview asks for a
   sign-in: go on, with a note for the report, since the run's first red will show whether
   Test Studio gets in.
2. **Start it.** When the `run_test_cases` schema takes `domain`:
   `run_test_cases {url, ids, domain}` with `affected.json`'s `ids`, each once, and the
   link as `domain` (the tool keeps only its host). Each case then opens its pages on the
   preview's host, with the path it was recorded on. When the deployed app's URL from 2.4
   has a path and the preview link does not, add a `--note` to the report saying so: a case
   that fails on its first page may be on a path the preview does not serve. The tenant may still run a case on the deployed app, with no error, when it does
   not allow the preview's host: the report checks each execution (section 7). When the
   schema has no `domain`, this tenant cannot
   run cases on a branch link: ask with AskUserQuestion whether to run the same cases on
   the live app now, as a baseline (recommended), or to stop with the selection. A
   baseline is `run_test_cases {url, ids}`, and its report says plainly that it does not
   cover the PR's code.
3. **Wait for it.** Call `fetch_test_case_last_execution {url, testCaseId}` with any one id
   from `ids` (a case id, never the execution id the run answered): its `TEST_SUITE_RUN_ID` is the run's
   id, never worked out from anything else. Poll
   `fetch_run_executions {url, runId, failedOnly}` with `failedOnly` false, `pause` between
   polls, until no execution is `QUEUED` or `RUNNING`, at most 40 polls (about 15 minutes: a case waiting on a missing
   element fails only at its 5-minute timeout). Save the last answer verbatim to
   `<run>/executions.json`. A tenant without `fetch_run_executions`: one
   `fetch_test_case_last_execution` per case, collected into one JSON array in that file. An
   execution still running after the last poll is named as not settled, never as failed.

## 7. The report

```
affected.mjs report --affected <run>/affected.json --executions <run>/executions.json --pr <run>/pr.json --on <link> --run <run id> --app-url <platform screen URL> --out <run>/report.md
```

The script checks each execution's `DOMAIN` against the `--on` link. `--live` in place of
`--on <link>` for a baseline on the live app. Each note from sections 1 and 3, and a
preview that answered 401 or 403, is one `--note "<text>"` of its own. The report lists the reds
with their failing step and error, marks each **new** (it passed on its last run before this
one) or already failing, names the cases not settled and the ones that passed, and shows why
each case was picked and what each changed file reaches.

Then tell the person, the outcome first, with the numbers the script printed:

- one line: `PR #12 on <link>: 9 of 140 cases ran, 7 passed, 2 failed (1 new).`, where 9 is
  `counted`, the cases counted for the preview. When the script printed `ranElsewhere` above
  0, add the cases that ran elsewhere, by host, from `elsewhereHosts` (`3 ran on
  another app's preview host instead, not counted`); when `counted` is 0, the line
  names only the hosts the cases ran on, and no result. When it printed `unconfirmed` above 0, add how many cases have no recorded
  host, so their results are not confirmed for the preview;
- each new red: the case and its failing step;
- the report file's path;
- for any red, the next step:
  `/ua:app-test-triage-loop <run id> for <platform screen URL>` sorts them by cause.

## Done

The work is done when all of these hold; say which one failed otherwise:

- `affected.json` was written by `affected.mjs select`, unedited.
- The run took exactly `affected.json`'s `ids`, each once, with the link the report names
  as `domain`, or with no `domain` for a baseline on the live app.
- The chat counts only the cases the script counted for the preview, and names the hosts
  the others ran on.
- `executions.json` holds an execution for every id, or the report names it as not settled.
- `report.md` was written by `affected.mjs report`, and every number in the chat is one it
  printed.

## When a step fails

| What you see | What to do |
|---|---|
| `gh pr view` answers not found | The link is wrong, or the signed-in GitHub account cannot see the repository. Say which and stop. |
| `gh api` answers with a rate limit | Say so and stop: GitHub names the time the account can read again. |
| A changed file has no `patch` (GitHub leaves it out of very large diffs) | Nothing to do: the script treats a router file without its diff as reaching every page. |
| `get_code_app` answers `ok: false`, or `get_branch_codebase` refuses the default branch too | Show its `error` and stop. Nothing was written. |
| `run_test_cases` is refused | Show the error and stop: no case ran. A link with a port, or text that is not a link, is refused this way: say so, and ask for the preview link without a port. |
| The script prints `ranElsewhere` above 0 | Those cases ran on the host it names, not on the preview: the tenant does not allow the preview's host for runs. Report it as section 7 says. The platform team can add the preview's host to the environment's allowed domains; then run the PR again. |
| An execution is still `QUEUED` or `RUNNING` after the last poll | Report it as not settled, with its id. It is a platform problem, not a red. |
