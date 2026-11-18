# The WEB metrics

## Contents

- How the page is read
- The metrics
- The step file
- Findings and their fixes
- What the numbers cannot see

## How the page is read

`installProbe` (in `scripts/lib/probe.mjs`) starts PerformanceObservers with
`buffered: true` for `largest-contentful-paint`, `layout-shift`, `longtask`,
`long-animation-frame` and `event` (duration threshold 16 ms), so a page that
finished loading before the probe still reports its load. `collectStep` waits
until the page is quiet, then reads navigation and paint timing, the
observers' entries (for a step, only those after its mark), resource timing,
the images in the app, `performance.memory` and the DOM and block counts.
Node turns that into the step file (`scripts/lib/step.mjs`); the data-source
calls come from browser.mjs `calls`, kept from the step's start on.

## The metrics

Lower is better for every one; `pass` when the value is at most the first
threshold, `warn` up to the second, else `fail`. The table is `WEB_METRICS`
in the orchestrator's `perf-json.mjs`; a run passes its own with
`build --thresholds <file>`.

| Metric | Unit | Pass ≤ | Warn ≤ | Steps | Read as |
| --- | --- | --- | --- | --- | --- |
| `ttfbMs` | ms | 800 | 1800 | open | navigation `responseStart` |
| `fcpMs` | ms | 1800 | 3000 | open | the `first-contentful-paint` entry |
| `lcpMs` | ms | 2500 | 4000 | open | the last LCP entry; its element's block is named |
| `domContentLoadedMs` | ms | 2000 | 4000 | open | navigation `domContentLoadedEventEnd` |
| `loadMs` | ms | 3000 | 6000 | open | navigation `loadEventEnd` |
| `cls` | score | 0.1 | 0.25 | all | the largest session window of shifts without recent input (gaps under 1 s, a window at most 5 s) |
| `inpMs` | ms | 200 | 500 | interaction | the longest event of each interaction (by `interactionId`), the worst interaction, the 98th percentile from 50 interactions on; without ids, the longest pointer or key event, marked approximate |
| `longestTaskMs` | ms | 200 | 700 | all | the longest long task, else the longest animation frame over 50 ms |
| `totalBlockingTimeMs` | ms | 200 | 600 | all | the sum of each long task's time past 50 ms (a frame's `blockingDuration`) |
| `dataSourceCalls` | count | 6 | 12 | all | browser.mjs `calls` from the step's start |
| `duplicateDataSourceCalls` | count | 0 | 2 | all | the same source with the same body again within 2 s |
| `slowestDataSourceMs` | ms | 1000 | 3000 | all | the call's resource timing `duration` |
| `resourceCount` | count | 150 | 300 | open | resource timing entries |
| `transferKB` | KB | 1600 | 5000 | open | the sum of `transferSize` (0 for a cached or a cross-origin resource without timing access) |
| `jsHeapMB` | MB | 100 | 250 | open | `performance.memory.usedJSHeapSize` after the open |
| `jsHeapGrowthMB` | MB | 10 | 50 | interaction | the heap after the step less the heap at its mark |
| `domNodes` | count | 1500 | 3000 | open | elements inside the app root |
| `mountedBlocks` | count | 400 | 1500 | open | `[data-block-id]` elements in the page |
| `largestAssetKB` | KB | 200 | 500 | images | the largest image's transfer size |
| `oversizedImages` | count | 0 | 2 | open | images at least twice their shown size × device pixel ratio both ways |

The thresholds for LCP, CLS, INP and total blocking time are the Core Web
Vitals and Lighthouse ones; the rest are starting points read on the builder
preview, not agreed targets.

## The step file

`<step>.<run>.web-step.json`, schema `loops.web.step/1`: `step`, `kind`
(`open` or `interaction`), `run`, `pageId`, `startedAt`, `width`, `viewport`,
`cache` (`cold` or `warm`), `metrics` (one value per metric above, null where
the kind does not measure it), `lcp` (`ms`, `tag`, `blockId`, `url` path),
`shifts`, `longTasks` (`source`, `count`, `longestMs`, `totalBlockingMs`),
`inp`, `resources` (`count`, `transferKB`, `sizeUnknown`, `byType`,
`largest[]`), `images[]` (`path`, `format`, `kb`, `natural`, `shown`,
`oversized`, `blockId`), `dataSources` (`count`, `failed`, `duplicateCalls`,
`duplicates[]` with `bodyHash` and `atMs`, `slowest`, `calls[]`), `memory`,
`counts`, `settle`, `notes`. `perf.json` keeps each step with its `times`,
`requests`, `memory`, `counts`, `resources`, `lcp`, `shifts`, `longTasks` and
`inp`; `assets[]` holds the images, `network` the calls, and `cpu` stays
empty with `cpu` in `unmeasured`.

## Findings and their fixes

`findings` writes one issue per metric past pass, worst first. The region is
the LCP block for `lcpMs`, the shifting block for `cls`, the source for the
data-source metrics, the image for the image metrics, else the step. The fix
hints point at page config: a loader over every data region and static chrome
first (rulebook X1), fixed heights for data regions (CLS), one source per
object read (P3), one refresh per interaction (P10), paging long lists (P6),
images at their shown size (P4). A finding is a lead for the fix job, which
proves it with a step before and after its draft.

## What the numbers cannot see

- Chrome keeps 250 resource entries by default; the probe raises the limit to
  5000. A data-source call whose resource entry was dropped has no `ms`, and
  `slowestDataSourceMs` leaves it out.
- When Chrome buffers no `longtask` entry, long animation frames stand in for
  long tasks, and the step's notes say so.
- The preview loads the platform's builder code beside the app, so the long
  tasks, `resourceCount`, `transferKB` and the heap include the builder's
  share. Compare a page with itself before and after a fix.
- When `performance.memory` does not answer, `jsHeapMB` and `jsHeapGrowthMB`
  are in `unmeasured`.
