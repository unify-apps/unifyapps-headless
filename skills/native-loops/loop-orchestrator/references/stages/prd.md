# Stage: prd

## Contents

- When it runs
- 1. Intake
- 2. Run settings
- 3. The first draft
- 4. A round
- 5. The PRD approval
- Done when

The scope loop's first stage: from what the person has to a PRD a builder
can work from without guessing. The draft is written in the run folder,
checked, read by a fresh reviewer each round, and saved on the solution as
the app's open PRD draft, so a teammate sees it while it is being written.
The shape is the scope loop's [PRD template](../../../../../loops/native-scope-loop/references/prd-template.md).

## When it runs

At the start of every `/ua:native-scope-loop` run. A run that resumes reads
`R/prd.md`, the last review and the board, and continues at the next round.

## 1. Intake

1. **The app.** `ua prd list --json` and `ua solution context --json`.
   - An app with a PRD: `ua prd get <app> --json`. Its version is the
     base of this run. An open draft (`draft` is set) saved by someone else
     is shown to the person with who saved it and when: continue it, or
     start from the approved version (the person's yes discards the draft
     with `ua prd discard <app> --version <n> --record-version <r>`).
   - An existing app with no PRD: `loops platform <appId>` (the loop is for
     one platform; the other one stops it with its line). `ua entity context app <appId>`,
     `ua cache nav --app-id <appId>`, `ua cache paths --app-id <appId>`,
     `ua cache obj <id>` and `ua cache wf <id> --contract` per object
     and automation, and the route map (`loop-route-map`) fill `## Current state`: each page and what
     it does, each object and its key fields, each automation and what
     triggers it.
   - A new app: its name from the words, else a run settings question. The
     app slug is the name's slug.
2. **Sources.** Write `R/brief/sources.md`: the person's words as typed, and
   one line per source with where it came from.
   - A Google Doc or a Claude doc: read it with the connector the person
     has; a link no connector reads: ask for the text or a file.
   - A Markdown file or a PDF: read it.
   - Figma frames: `mcp__claude_ai_Figma__get_metadata` per frame link, for
     its name and size only. Never a screenshot or the design context: the
     build run captures the frames it builds.
   - Screenshots: one screen each, named from what it shows.

## 2. Run settings

At most four questions, together, as the orchestrator's § Settle the rules
says, each with a default from the reads:

- Where the tickets go: the team and the project in the person's issue
  tracker, as they name them. The PRD's `tracker` line on a re-run is the
  default.
- Who the tickets are assigned to: the person, nobody, or a named teammate.
- A new app's name, when the words give none.

The run writes the tickets as files and the person files them. Those two
answers are the names that go on each one, so a ticket is ready to paste
wherever the team keeps its work.

## 3. The first draft

Write `R/prd.md` in the template's shape, from the sources:

- Every section the sources answer, in the sources' own facts. Nothing
  invented: a fact no source gives is a question, or an open question with
  an owner.
- Frames and screenshots become `### S<n>` screens with their link.
- On a re-run, start from `ua prd get <app> --part prd` and change only
  what the new words change. Ids stay with what they name.
- `# App plan` stays empty here; on a re-run it is copied from the current
  version and revised in the app-plan stage.

## 4. A round

At most four rounds: past the third, what is left is a decision for the person, not a gap a round closes. Each round:

1. `ua prd check --file R/prd.md --json > R/reviews/check-<n>.json`.
2. The reviewer: one general-purpose agent with the
   [PRD reviewer brief](../../../../../loops/native-scope-loop/references/prd-reviewer.md),
   writing `R/reviews/round-<n>.md`. Log the dispatch and its reply.
3. The questions: the check's issues (each carries the question that
   fills it) and the reviewer's questions, without the ones the sources or
   earlier answers already settle, at most four, in one AskUserQuestion,
   likeliest answer first. Record each answer in `R/brief/BRIEF-COMMON.md`
   and as an `approval` event.
4. Revise `R/prd.md` with the answers and the blocking findings.
5. `ua prd save <app> --file R/prd.md --base <the base version, or new> --note "Round <n>" --json`.
   Over an open draft it needs `--record-version` from the last save;
   keep it on the board. `VERSION_CONFLICT` means a teammate saved the
   draft meanwhile: `ua prd get <app> --version <n>`, merge their change
   into `R/prd.md`, say so, and save again. `PRD_BASE_MOVED` means a new
   version was approved meanwhile: stop the round and tell the person.

The rounds end when the check answers `ready` and the reviewer's verdict is
`ready`. After the fourth round with gaps left, the escalation: Accept with
the gaps as open questions (each with an owner) · One more round · Stop.

## 5. The PRD approval

One AskUserQuestion: the outcome in a line, the roles, the journeys,
requirements by priority, the screens, the open questions with their
owners, and the path `docs/prd/<app>.md`. Options: Approve the PRD · Change
something · Keep it as a draft.

The yes is recorded on the board and as an `approval` event. The version
itself is approved with its plan, at the tickets stage's plan approval.
Keep it as a draft ends the run: the draft stays on the solution for a
later run.

## Done when

`R/prd.md` passes `prd check`, the last review says `ready` or the person
accepted the gaps as open questions, the draft is saved on the solution, and
the person approved the PRD.
