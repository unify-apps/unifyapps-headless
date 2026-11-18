# Limits

Every limit a run keeps, where it comes from, and why. A run reads its
limits once, at the start: the agents and the test runners from
`loops health --json` (its `capacity` key: `agents`, `runners`, and on MOBILE
`pool`, the `suggested` values and the `machine` they came from; on WEB
`browsers`, `freeGb` and `cap`), the rest from `LOOPS_HOME/config.json` (`limits`,
defaults below). It writes them into `board.json` and says which one stopped
it when one does. It never stops early in silence.

| Limit | Default | Where it is set | Why |
| --- | --- | --- | --- |
| `maxAgents`: agents at work at once in the audit, fix and build stages | `10 + 2 × (pool − 3)`, kept within 10–20: 18 on a 24 GB laptop with 8 performance cores, 20 from 36 GB up | `capacity.agents` (`skills/native-loops/loop-orchestrator/scripts/lib/capacity.mjs`); `config.json` `capacity.agents` overrides it | Each agent spends its own tokens and tenant calls. UnifyApps Headless's chat rule of six builders is lifted to this number inside a loops run only. |
| `runners`: test runners at once | MOBILE: the pool size, `min(floor((RAM_GB − 10) / 2), perfCores, 12)`, at least 1, for slim simulators, and never more than the simulators the pool has; `min(floor((RAM_GB − 10) / 4.5), floor(perfCores / 2), 10)` when `pool.slim` is false. WEB: the browsers, about one per GB of free memory, at least 1, at most the cap (6) | MOBILE: `capacity.pool`; `config.json` `capacity.pool` (or `pool.size`) overrides it. WEB: `capacity.browsers` (web-browser's `capacity.mjs` rule, read live by `loops health --platform web`); `config.json` `capacity.browsers` sets the cap | MOBILE: one simulator per test runner, through the reservation. A slim simulator takes about 1.4 GB and a third of a core while an agent drives it, so a 24 GB laptop with 8 performance cores gets 7, a 36 GB one 10, the cap is 12 (stock: 3, 5 and 10). WEB: one Chrome for Testing browser folder per test runner, no reservation; free memory changes, so it is read at the start of each run. |
| `maxAttempts`: reopens per issue, tries per reproduction, and attempts per acceptance or realtime check | 4 | `config.json` `limits.maxAttempts` | Issues still open after four fix-and-retest attempts were design questions or platform limits. Then the escalation question. |
| `jobMinutes`: time per job before the person is asked | 50 | `config.json` `limits.jobMinutes` | The hard issues of a whole-app rebuild took 40–50 minutes of fix-and-retest each. |
| `maxPasses`: visual check passes per page in `build` | 4 | `profile.json` `loop.maxPasses`, else `config.json` `limits.maxPasses` | Past the third pass the gaps left were spec questions, not fixes. |
| `warnTokens`: tokens before a warning | 600 000 | `config.json` `limits.warnTokens` | Sessions compacted four times near a million tokens; the run writes its state at the warning so it survives compaction. |
| Images in context | 2 per check or per screen | the stages | Measurement screenshots go to disk with `includeImageInContext: false`; 555 images (73 MB) once entered a build's contexts. |
| Figma calls per page | screenshot first, frame metadata only, design context at most once, never retried within 24 h of a rate limit | the design intake | A View seat rate-limits after about ten calls; one section's metadata was 434K characters. |
| Health tries | 3 tries, 20 s then 60 s, only for `tenant_5xx` and `bridge_down` | `loop-preflight` health | A failing tenant must not spend builder attempts. |
| Builder tries per piece | UnifyApps Headless's own: two tries, then a question | `ua:ua-change` | — |
| Device reservation | 30 min, renewed while the agent drives; at most 4 h (MOBILE; a WEB browser folder is not reserved) | `config.json` `reservation` | One argent tool-server serves every agent on the laptop. |
| Queue wait | none: an agent never waits for a simulator; the orchestrator waits in the background for at most 60 min per request, then asks | [SKILL.md](../SKILL.md) § Device queue | A run that sat on retries for twelve minutes lost its place when the session ended. |

## How the orchestrator spends them

- **Audit stage.** One agent per page × check, up to `maxAgents` at once; the
  rest start as agents report, worst-severity pages first when a previous run
  gave severities, else in the page order of `scope.json`.
- **Fix and build stages.** One job per page, shared item or automation, up
  to `maxAgents` at once; a job past that waits on the board as `waiting`.
  Jobs never share a page or an automation.
- **Reproduce stage.** One agent per reported issue, each holding a device
  (on WEB a browser folder of its own), so at most `runners` at once.
- **Test-and-fix stage.** Exactly `runners` test runners, started when the
  queue first gets work and kept while it has work. A test runner that finds the
  queue empty for 5 minutes ends; a new one starts when work arrives and fewer
  than `runners` run.
- **Tokens.** Never summed during a run. `report` sums them from the run log
  when the person asks.

## Changing them

`LOOPS_HOME/config.json`:

```json
{ "capacity": { "pool": 3, "agents": 12, "browsers": 4 },
  "limits": { "maxAttempts": 4, "jobMinutes": 50, "maxPasses": 4, "warnTokens": 600000 },
  "pool": { "runtime": "iOS 18.6" } }
```

A missing key means the default; an older `config.json` with a `budget`
section is read when `limits` lacks the key.
`loops health --fresh --json` shows what is in force (`--platform web` for a
WEB app; without it the platform comes from the solution's loops profile). The
person may lower `maxAgents` for one run in the run settings; a run never
raises it above what `health` reports.
