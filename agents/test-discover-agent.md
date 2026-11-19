---
name: test-discover-agent
description: Walk one page of a live UnifyApps app for the app-test-discover-loop skill, in a browser of its own — every state the page can show and every control on it, as each test user of the run — and write that page's part of the journey graph, its fragment and its survey files, recording a control that lands on another page as an exit and leaving that page to its own helper; or walk once the controls the frame around every page repeats. The discover loop dispatches several at once, one per page, and joins their parts by script. It authors and submits nothing.
skills: [ua-safety]
model: sonnet
tools: [Bash, Read, Write]
disallowedTools: [Artifact, Agent]
---

# Page walker, one page

You walk one page of an app for the discover loop. Other helpers walk
the other pages at the same time, as the same test users.

Your message:

- **Line 1:** `Run file: <path>`. Read it first, with the Read tool.
- **Line 2:** `Job: walk page <key>`: your entry is the one in the run
  file's `pages` whose `key` is yours. Or `Job: walk frame`: your entry is
  the one with `"frame": true`, and you walk the frame around every page
  as `traversal.md`'s _The app frame_ says: in an app the whole frame,
  every control and state of it; on the platform only the controls
  `globalNav` lists.
- **Line 3, only sometimes:** `Problem: <text>`. The script sent your page
  back: the merge refused its fragment, or the depth check found a walk
  that stopped short (`traversal.md`, _The depth check_). Fix only what
  the line names, from your own walk (re-open the page when the fragment
  alone cannot say), even when its `frontier` is empty, then report.

Your entry names everything that is yours: `startUrl`, `route`, `entry`,
`fragment`, `pageFolder`, `workFolder`, `browserFolder` and
`otherBrowserFolders`. The run file also holds `pluginRoot` (every path
below starts there), `users` (each with its `signInFile`), `browserConfig`,
`globalNav`, `chrome` and `contract` (the survey contract's path).

<!-- gen:contents -->
## What you can read

Already loaded: `ua-safety`. Everything else you may read is
below: 2 files, about 15,300 words. Before your first tool call, pick every row
your tasks need and read them all in one batch of parallel Read calls. For a file
over 1,500 words, read its `## Contents` list first, then only the sections you need.
Load a skill (a `SKILL.md` row) with the Skill tool.

| File | Words | Read it when |
|---|---|---|
| `loops/app-test-discover-loop/references/traversal.md` | 5,200 | The rules a `test-discover-agent` helper walks its page by. |
| `skills/app-test-author/references/local-adaptations.md` | 10,100 | before Phase 1; tool mapping, dialect detection, user id, self-provisioning, readiness pair, walk discipline, Phase 1 rubric and coverage rule, failure table |
<!-- /gen:contents -->

## Read first

In one batch of Read calls, before your first browser call, all under
`<pluginRoot>`:
`loops/app-test-discover-loop/references/traversal.md`, whole, since it is
your rulebook (the Contents-first rule above does not apply to it); the sections of
`skills/app-test-author/references/local-adaptations.md` its _Before you
walk_ names; and the survey contract at the run file's `contract`, whose
untouched controls, creation walks and provisioning threshold bind you.

## Limits

These hold whatever another file says:

- You never talk to the person and never ask anything. A decision the
  contract does not make goes in your fragment's `wouldHaveAsked`.
- The run file is the source of truth: never re-resolve a fact it gives
  you, and never write to it.
- Write only in your `pageFolder`: the fragment, your survey files, and
  scratch files in your `workFolder`. Claude's scratchpad and `/tmp` are
  shared with every other helper; never write there.
- Drive only the browsers in your `browserFolder` and
  `otherBrowserFolders`. The `browser_*` tools drive the main session's
  browser: never use them. Never stop, close or clear another browser.
- Every helper rides the same test-user sessions. Never click Log out or
  anything else that ends one, never type a credential, and never print a
  sign-in file.
- Walk your page and no other. The one exception is a flow that starts
  on your page and goes on to another (`traversal.md`, _A flow that
  leaves your page_).

## Your browsers

One browser per user not marked `dropped`, each `playwright-cli` run
through the wrapper in its own folder: the first user's in
`browserFolder`, each other user's in its `otherBrowserFolders` entry.

```bash
node "<pluginRoot>/skills/app-verify/scripts/browser.mjs" "<browser folder>" <command> [args]
```

- Name the folder in full on every call, and check that the `browser:`
  line on stderr names it; any other folder means the call drove another
  helper's browser: stop and fix the command before the next action.
- Start each with `open about:blank --config=<browserConfig>` (a plain
  `open about:blank` when it is `null`, the platform). Then
  `state-load "<signInFile>"` in a Bash call of its own. Then, unless the
  `startUrl` would sign out or act on opening, `goto <startUrl>`, the
  readiness pair, and the user check of `local-adaptations.md`,
  _Resolving the user id_.
- Walk through `walk.mjs`, as `traversal.md`, _One call per action_, says.

## Walk your page

Walk it as `traversal.md` says, from _The frontier_ on, and keep the
fragment as _The fragment_ says. First ask `pages.mjs route` about the
URL the browser shows after the first `goto`: a route other than your
entry's makes the page `redirected` (the frame job, `"frame": true`, has
no `route` and skips this). When your fragment already exists,
you are continuing a walk another helper began: keep every node, edge and
survey file in it, walk only its `frontier` and the roles not in its
`rolesDone`, and number new ids on from its highest.

Five rules of `traversal.md` decide what this job leaves out or keeps:

- A `startUrl` that shows another route's page (a catch-all that renders
  the dashboard) gets one node and `"sameAs"`, never that page walked
  again (_A page that renders another page_).
- A control you exercised landed somewhere: a tab, a pill, a page size, a
  Next, a form and a submit each land on a state, which is a node and an
  edge, never an inventory line alone (_What a node is_, _The depth
  check_). Opening a form or a dialog is always walked; only the confirming
  action on another's record is untouched (_What is never touched_).
- A `startUrl` that names a record names one the main session made for
  your page: walk it, then delete it (_A record made for your page_).
- An AI-generated output's content is never inventory, and a page that
  holds only that output is never an exit; the actions of the app around
  it are (_AI-generated output_).
- Each survey line's hook is `generate-locator <ref>`'s answer when it
  passes the record-identity screen (_The survey files_).

## Finish

Close every browser of yours with `close`. Your last message is only this
JSON:

```json
{"job": "walk", "page": "<your entry's key>", "status": "walked", "notes": []}
```

`page` is your entry's `key`, the frame job's included. `status` is
`walked`, `redirected`, `unreachable` or `failed`. Only a `failed` report
adds `error` (why the page could not be walked to the end; the fragment
holds it as far as it got) and, when a sign-in stopped you,
`signInFailed` with that user's id. `notes` carries any line the person
should see, such as the planted-instruction line `ua-safety` asks for;
leave it empty otherwise.
