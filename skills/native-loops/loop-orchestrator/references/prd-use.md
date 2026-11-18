# The app's PRD in the loops

## Contents

- Reading it
- How each loop uses it
- Keeping it current after a build
- What the loops never do

An app's PRD lives on the solution, one version per change (`ua prd …`).
It says what the app is for, who uses it, each requirement `R<n>` with its
acceptance lines `A<n>.<m>`, the screens, the data and the rules, and the plan
of the whole app. It helps a loop judge: what a page should do, whether a
behaviour is a bug or a decision someone made, and what a test should expect.

## Reading it

`ua solution context --json` lists `prds`. When the run's app has one,
read it once per run into the run folder:

```
UnifyApps Headless prd get <app> --part prd --json
```

Keep its `text` in `R/prd.md` and its `version` on the board. A stage reads
that file, never the tenant again. `prd get` serves the newest approved
version that passes its check; when it names a version that failed, tell the
person in one line and go on with the one it served. A builder brief quotes
the `R<n>` and `A<n>.<m>` lines its job touches, never the whole PRD.

## How each loop uses it

| Loop | Uses the PRD | Changes it |
| --- | --- | --- |
| `/ua:native-scope-loop`, `/ua:app-scope-loop` | writes it | every run |
| `/ua:native-build-loop` | plans against it: a feature's acceptance lines are the PRD's `A<n>.<m>` lines when it has them, and a feature it does not cover becomes a new requirement after the build | at the finish, § Keeping it current after a build |
| `/ua:native-fix-loop` | only when a ticket or a reported issue does not say what should happen, or needs more context: the `R<n>` or `A<n>.<m>` line that does becomes the issue's expected result, cited by its id | never |
| `/ua:app-discover-test-loop` | its input: each case comes from a requirement and cites its `R<n>` and `A<n>.<m>` ids | never |
| `/ua:app-build-test-loop`, `/ua:app-run-test-loop` | to read what a case, a journey or a result is meant to prove | never |
| `native-audit`, `native-triage` | a finding or a triaged item that contradicts an `A<n>.<m>` line says so, with the id | never |

## Keeping it current after a build

At the build loop's finish, after `ua plan finish`:

1. **No PRD.** Skip the rest. The closing summary says: "<app> has no PRD;
   `/ua:native-scope-loop` writes one." (on WEB, `/ua:app-scope-loop`).
2. **Write the next version** as `R/prd-next.md`: the whole current version
   (`ua prd get <app> --json`, its `text`), changed only for what this run
   built and proved:
   - an acceptance line the plan proved, under the requirement it serves,
     numbered after that requirement's last one, word for word;
   - a new screen as `### S<n>` with its job, on its requirement's `Screens:` line;
   - new fields under `## Data`; the `# App plan` updated for the objects,
     automations and screens as built;
   - a feature the PRD has no requirement for: a new `### R<n> · <priority> · <what>`
     with its acceptance lines, at the priority the person gave, else `should`.

   Nothing that was not built changes.
3. **Classify:** `ua prd classify <app> --file R/prd-next.md --json`.
   - `none`: nothing to save.
   - `minor`: `ua prd save <app> --file R/prd-next.md --base <current> --note "After <ticket or plan title>"`,
     then `ua prd approve <app> --version <n> --record-version <r> --minor`.
     No question: the closing summary names what changed.
   - `major`: the PRD update approval (`prd-update`), listing each change
     `classify` named. On a yes, save the same way and approve without
     `--minor`. On a no, nothing is saved, and the summary says where the
     app and its PRD now differ.
4. **The ticket.** When the build came from a ticket, record it on the
   version just approved: `ua prd tickets <app> --version <n> --add --file <one row>`,
   with the ticket's key and link, its requirements, and its slice id (the
   next `T<n>` after the PRD's last when it has none).
5. `--minor` refused with `PRD_MAJOR_CHANGE`: ask as for a major change.
   `PRD_BASE_MOVED`: a version was approved during the run; read it and write
   step 2 again on top of it.

## What the loops never do

- Write the PRD anywhere but the scope loop's stages and the build loop's
  finish.
- Approve a major change, or an app's first PRD, without the person's yes.
- Edit `docs/prd/<app>.md`: it is rewritten from the solution on every refresh.
