# Limits

Every limit a run keeps, where it is set, and the evidence it comes from (the first native app builds). A run that hits one says which, in its report and in `receipt.json`; it never silently stops early.

| Limit | Value | Set in | Why |
| --- | --- | --- | --- |
| Visual check passes per page | `loop.maxPasses` in the profile (setup offers 3, 5, 8); `limits.maxPasses` in the config, 4, is the machine default a profile without one falls back to | `profile.json`, else `config.json` | The Home visual check ran 3 passes of a limit of 4; past that the gaps left were spec questions, not fixes |
| Tokens per run | warn at `limits.warnTokens`, 600 000; state written to the run folder at the warning | `$LOOPS_HOME/config.json` | Sessions compacted four times at about 967K tokens; a 52 MB SVG paste broke one |
| Images in context | at most 2 per pass; measurement screenshots taken with `includeImageInContext: false` | the visual check | 555 images (73 MB of base64) entered contexts in one early build |
| Figma calls per page | screenshot first; metadata of the frame node only; design context at most once; never retried within 24 h of a rate limit; exports are the reliable path | the design board | 33 calls, 10–11 rate-limited on a View seat; one section's metadata was 434K characters |
| Health tries | 3 tries, 20 s then 60 s, only for `tenant_5xx` and `bridge_down` | [health](health.md) | HTTP 500 ×36, bridge down ×18 |
| Builder tries per task | UnifyApps Headless's own: two tries, then needs-answer | the plan | 16 retries, 13 needs-answer |
| Concurrent runs per laptop | `limits.maxConcurrentRuns`, 6 | `config.json` | four parallel sessions on Oct 4 collided three times; the pool and the page lock on each page bound it |
| Builders at once | `limits.maxBuilders`, 6; 7 at most | `config.json` | seven jobs ran at once in a UI rebuild; more builders than that waited on the tenant, not on work |
| Attempts per issue | `limits.maxAttempts`, 4 | `config.json` | issues still open after four fix-and-retest attempts were design questions or platform limits |
| Job time | `limits.jobMinutes`, 50 | `config.json` | the hard issues of a UI rebuild took 40–50 minutes of fix-and-retest each; past that the orchestrator asks |
| Test runners at once | one per pool simulator (`pool status`) | the pool | one simulator per agent, through its reservation; the rest waits in the device queue |
| Device reservation | TTL 30 min, renewed while the session drives the device; `maxHoldSec` 14 400 | `config.json reservation` | one tool-server serves every session on the machine |

`LOOPS_HOME/config.json` is created by the device scripts (`pool`, `reservation`, `locks`, `limits` sections); a missing `limits` section means the defaults above. The agent limit and the pool size of a UnifyApps Headless loop run are sized from the laptop (the loops' `limits.md`); `limits.maxBuilders` here is the older per-run cap and the run's `maxAgents` replaces it. The number of visual check passes is the one limit the person chooses per solution; the others are machine-wide.
