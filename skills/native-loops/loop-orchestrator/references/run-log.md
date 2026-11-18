# Run log

## Contents

- What is logged
- How to append
- Redaction
- Tokens, the report and sharing

Every run logs what it did to `<run>/run-log.jsonl`, always, so the
developers can see where loops spend time and tokens and improve them.
Logging is cheap: one append per event, nothing summed or rendered during
the run. `report` reads the file only when the person asks
([native-report](../../native-report/SKILL.md)).

## What is logged

One JSON object per line: `ts` and `run` are added by the script, `type` is
required, the other keys depend on the type. The report reads these:

| Type | When | Keys |
| --- | --- | --- |
| `run.start`, `run.end` | the goal starts; the closing summary is shown | `goal`, `platform`, `scope`, `focus`, the request as typed; at the end `outcome` and the counts |
| `stage.start`, `stage.end` | every stage, every attempt | `stage`, `job`, `attempt`; at the end `outcome` |
| `dispatch` | every `Agent` call and every `SendMessage` to an agent | `stage`, `agent` (its type), `job`, `description` (exactly as the `Agent` call's), `toolUseId` when known, **`prompt`: the full brief as sent** |
| `report` | an agent's final reply arrives | `stage`, `agent`, `job`, `toolUseId`, `summary` (one line), **`report`: the full reply** |
| `skill`, `loop` | the session or a brief loads a skill or block; a `loops` command runs | `name`, `stage` |
| `approval` | right after every answer | `approval` (its id: `plan`, `deploy`, `code`, `publish`, … from [approvals](approvals.md)), `question`, `answer`, `recommended` (true or false), `seconds` |
| `reservation` | reserve and release | `action` (`reserve` or `release`), `udid`, `name`, `waitMs` |
| `queue` | a request added, taken, done or failed; a background wait ending | `action` (`add · take · done · fail`), `id`, `kind`, `waitMs` |
| `issue` | issues found, fixed, reopened, verified, escalated | `id` or `ids`, `status` (`found · fixed · reopened · verified · open · regressed · platform · escalated`), `page`, `severity` |
| `publish`, `deploy`, `commit`, `writeback` | a release, after its read-back | `app` or `automation` or `files`, `version`, the read-back line |
| `error` | a tool or tenant failure, a refusal, a retry | the error text, what was retried |

Keep a long text whole (a brief, a reply): the report and the developers read
it as it was.

## How to append

`loops log append --run <R> '<event JSON>'`, or `-` to read the event from
stdin. A brief or a reply is long: write the event to a file and pipe it
(`loops log append --run <R> - < R/log/<n>.json`), so a long prompt never
goes through the shell's quoting. Append:

- before a dispatch, with the brief the agent gets;
- when its notification arrives, with the reply;
- after every approval answer, reservation, queue change, issue status change
  and release.

A failed append never stops the run: say it once in the board's notes.

## Redaction

`loops log append` strips before it writes, with UnifyApps Headless's own redactor
(passwords, tokens, keys, Bearer and Basic values, cookies, session tokens,
JWTs, cloud keys) plus the refresh cookie, one-time codes and PINs typed into a
device, and every literal listed in `LOOPS_HOME/secrets.redact` (one per line).
The orchestrator still never puts a secret into a brief: redaction is the
second line, not the first. Tenant hosts, app ids and page ids stay in the
local run log; they leave the laptop only through `share`, scrubbed.

## Tokens, the report and sharing

- `loops log tokens <run>`: input, output and cache tokens summed from
  Claude Code's own transcripts of this session and its subagents, per agent,
  per agent type and per stage. A subagent is matched to its stage by the
  `dispatch` event's `toolUseId` or `description`, so write both as the `Agent`
  call had them. Only `report` runs it.
- `loops log report <run>`: `report.html` from the fixed template
  `templates/run-report.html`; the same events give the same bytes.
- `loops log share <run>`: a short anonymised summary of the run (goal, stage
  timings, agents per type, skill and loop counts, issue flow, approvals,
  simulator use, token totals), fixed fields only, every string scrubbed against
  the solution's profile and `LOOPS_HOME/scrub.list`. It goes into the remarks
  of `ua:give-feedback`, which uploads the redacted session itself, on the
  person's yes.
