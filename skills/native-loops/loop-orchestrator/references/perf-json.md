# perf.json (schema `loops.perf/1`)

## Contents

- Check
- Top level
- metrics
- WEB metrics
- steps
- The other sections
- Thresholds
- Rules

One file per performance check of a page: every measurement of the check in one shape. `loops.mjs perf render` fills the fixed report template from it, so the same `perf.json` always gives the same `report.html`. `findings.json` stays the agent feed: the issues a `fix` run takes. `perf.json` only points at it.

## Check

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-orchestrator/scripts/lib/perf-json.mjs" check "$RUN/perf.json" --run "$RUN"
```

A WEB run's `perf.json` (`"platform": "web"`) is built by web-profile's `profile.mjs build` into the check's folder (`R/perf/<pageId>/`, the `$RUN` above) and checked by this `check`.

## Top level

| Field | Type | What it holds |
| --- | --- | --- |
| `schema` | `"loops.perf/1"` | This shape |
| `platform` | `mobile` \| `web` | Whose metric table applies (below); a file without it is `mobile` |
| `runId` | string | `--run-id`, else `perf-meta.json`, else the run folder's name |
| `generatedAt` | ISO time | When it was built |
| `scope` | `page` \| `app` | `app` when more than one page was measured |
| `app` | `{ id, name }` | The app; `id` may be null when nothing named it |
| `pages` | `[{ id, name }]` | Pages measured, from flags, `perf-meta.json`, step files and `assets.json` |
| `device` | object | `name`, `udid`, `runtime`, `model`, `platform` (`ios` \| `android` \| null; `web` \| null on a WEB file), `profile` (`release` \| null), `buildKind` (`release-embedded` \| null), `bundleId` |
| `mode` | `full` \| `release-subset` | `release-subset` when only part of the metric table could be measured on the device |
| `verdict` | `pass` \| `warn` \| `fail` \| null | The worst metric verdict |
| `metrics` | object | One entry per measured metric (below) |
| `steps` | list | One entry per step name (below) |
| `network` | object | `calls`, `bytes`, `failed`, `duplicates[]`, `slowest[]` |
| `frames` | object \| null | `dropped`, `total`, `droppedPct`, `worstGapMs`, `longFrames` over every step |
| `memory` | object | `samples[]` (from `memory.jsonl`), `trends[]` (one per label), `leakSuspect`, `jsHeapPeakMB`, `rssPeakMB`, `appGone` |
| `assets` | list | One image each: `uri` (path, no host or query), `scheme`, `component`, `count`, `width`, `height`, `bytes`, `type`, `format`, `kb`, `verdict` (null when the size is unknown), `why`, `pageId`, `file` |
| `rerenders` | list | `{ kind: block \| component, id, renders, step }`, most first, at most 40 |
| `lists` | list | `{ listBlockId, rows, blocksPerRow, dataRows, verdict, step }` |
| `cpu` | object | `profiles[]` (`path`, `meta {seconds, actionAtSec}`, `groups`), `topGroups[]` (`group`, `pct`, `sec`, `window`, `groupsFile`), `devOnlyPctMax` |
| `findings` | object \| null | `{ path, count, kinds[] }` of the `findings.json` the check wrote: the loop's issue feed |
| `duplicates`, `profiles`, `leaks` | lists | Flat aliases: `network.duplicates`, `cpu.profiles`, and the `memory.trends` with `leakSuspect` |
| `notes` | list of strings | Each step's own notes, an app that died |
| `unmeasured` | list | `{ metric, reason }` for every metric with no sample, and `cpu`, `memory`, `assets` when their files are missing |

## metrics

A file without `platform` (or `"platform": "mobile"`) answers to this table. Each entry: `{ label, value, unit, samples: [{ step, value }], threshold: { pass, warn }, verdict, evidence, step }`. `value` is the worst step's value (each step's value is the median of its runs); `evidence` is that step's first file, relative to the run folder; `step` names it. For `memorySlopeMB` a sample is a memory label; for `largestAssetKB` it is an image.

| Metric | Unit | Pass ≤ | Warn ≤ | Steps it covers |
| --- | --- | --- | --- | --- |
| `ttrMs` | ms | 1000 | 2500 | open, hop, tab, back, foreground |
| `ttiMs` | ms | 2000 | 5000 | open, hop, tab, back, foreground |
| `transitionMs` | ms | 300 | 1000 | open, hop, back |
| `longestFreezeMs` | ms | 200 | 700 | all |
| `framesDroppedPct` | % | 5 | 15 | all |
| `requests` | count | 6 | 12 | all |
| `duplicateRequests` | count | 0 | 2 | all |
| `requestKB` | KB | 200 | 1000 | all |
| `jsHeapGrowthMB` | MB | 10 | 50 | all |
| `memorySlopeMB` | MB | 0.5 | 1 | memory labels with 3 or more samples |
| `mountedBlocks` | count | 400 | 1500 | all |
| `unvirtualisedLists` | count | 0 | 0 | all |
| `maxBlockRenders` | count | 3 | 10 | steps run with `--render-counts` |
| `largestAssetKB` | KB | 200 | 500 | images with a known size |

Lower is better everywhere: `pass` when the value is at most `pass`, `warn` when at most `warn`, else `fail`.

## WEB metrics

A `"platform": "web"` file answers to `WEB_METRICS` instead (every one measured or in `unmeasured`), from a page's saved draft in the UnifyApps Headless browser; what each measures is in web-profile's metrics reference. Its `device.platform` is `web`, `frames` is null, `memory.samples`, `rerenders`, `lists` and `cpu` stay empty (`cpu` in `unmeasured`: tracing is refused in a signed-in browser), and each step also keeps `resources`, `lcp`, `shifts`, `longTasks` and `inp`.

| Metric | Unit | Pass ≤ | Warn ≤ | Steps it covers |
| --- | --- | --- | --- | --- |
| `ttfbMs` | ms | 800 | 1800 | open |
| `fcpMs` | ms | 1800 | 3000 | open |
| `lcpMs` | ms | 2500 | 4000 | open |
| `domContentLoadedMs` | ms | 2000 | 4000 | open |
| `loadMs` | ms | 3000 | 6000 | open |
| `cls` | score | 0.1 | 0.25 | all |
| `inpMs` | ms | 200 | 500 | interaction |
| `longestTaskMs` | ms | 200 | 700 | all |
| `totalBlockingTimeMs` | ms | 200 | 600 | all |
| `dataSourceCalls` | count | 6 | 12 | all |
| `duplicateDataSourceCalls` | count | 0 | 2 | all |
| `slowestDataSourceMs` | ms | 1000 | 3000 | all |
| `resourceCount` | count | 150 | 300 | open |
| `transferKB` | KB | 1600 | 5000 | open |
| `jsHeapMB` | MB | 100 | 250 | open |
| `jsHeapGrowthMB` | MB | 10 | 50 | interaction |
| `domNodes` | count | 1500 | 3000 | open |
| `mountedBlocks` | count | 400 | 1500 | open |
| `largestAssetKB` | KB | 200 | 500 | images with a known size |
| `oversizedImages` | count | 0 | 2 | open |

## steps

`{ name, kind, openKind, pageId, files[], runs, times { firstCommitMs, ttrMs, ttiMs, transitionMs, longestFreezeMs, jsIdleMs, ttiQuietSeen }, frames, requests { calls, bytes, failed, duplicateCalls, duplicates[] (as below) }, memory { jsHeapMB { before, after }, rssPeakMB, appGone, source }, counts { blocks { total, notInTypeMap }, lists[], renders { topBlocks, topComponents } }, notes[] }`. Times are medians over the step's runs; network, frames, lists and re-renders come from its first run, so a repeated timed step does not count the same calls twice.

## The other sections

- `network.duplicates[]`: `{ method, url, bodyHash, atMs[], repeats, count, step }`, the same method, path and body again within 2 s.
- `network.slowest[]`: the ten slowest requests, `{ step, method, url, ms, bytes, status }`.
- `memory.trends[]`: `{ label, key (jsHeapMB | rssMB), points, first, last, peak, slopePerSample, leakSuspect, file }`.

## Thresholds

`profile.mjs build --thresholds <file>` replaces any of them: `{ "lcpMs": { "pass": 2000, "warn": 3500 } }`. The defaults are starting points, not targets agreed with anyone.

## Rules

- Every path in the file is relative to the run folder; `check --run` proves each exists.
- Every metric in the table of the file's platform is either in `metrics` or in `unmeasured` with a reason. A metric is never guessed.
- No host, query string, cookie, token or request body is written: request URLs and image URIs are paths only, and a duplicate carries a 12-character hash of its body (`bodyHash`).
- A finding still needs its evidence in `findings.json`; a `fail` in `perf.json` alone is not a finding.
