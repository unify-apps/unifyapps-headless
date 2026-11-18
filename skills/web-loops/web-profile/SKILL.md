---
name: web-profile
description: "Only used by the UnifyApps Headless loops, for WEB UnifyApps apps: measures the runtime perf of a page's saved draft in UnifyApps Headless's own browser, per fresh open and per interaction - LCP, CLS, INP (event timing), long tasks and total blocking time, TTFB, FCP, DOMContentLoaded and load, resources (count, bytes, largest, image formats and oversized images), data-source calls (count, duplicates, slowest, from browser.mjs's recording) and the JS heap - through buffered PerformanceObservers read with eval, since tracing is refused in a signed-in browser. Writes perf.json (schema loops.perf/1 with platform web, checked by the loop orchestrator's perf-json.mjs) and the findings as issues, for the performance check of the fix loop. Read when a WEB page is profiled, or its perf.json or findings are read."
user-invocable: false
---

# Web profile

Runtime perf of a WEB page, measured where the person looks at the draft:
the builder preview route in a WEB test runner's browser
([web-browser](../web-browser/SKILL.md)). Every number comes from the page's
own performance timeline, read through `eval`; the orchestrator renders its
`perf.json` (`loops perf render`), from the metric
table [perf-json](../../native-loops/loop-orchestrator/references/perf-json.md)
keeps for `platform: web`.

## Where it runs

In one place: the performance check of the fix loop on a WEB app. The audit
queues `performance --platform web`; the WEB test runner that takes it runs
`open`, the steps the request names, `build` and `findings` below, into
`R/perf/<pageId>/` ([runner](../web-browser/references/runner.md)).

## Commands

`P="${CLAUDE_PLUGIN_ROOT}/skills/web-loops/web-profile/scripts/profile.mjs"`; `<dir>` is
the check's folder, `R/perf/<pageId>/`. Every command answers `--help` and
prints one JSON line.

```bash
node "$P" open --browser <browser> --url "<preview url>" --step open-home --out <dir>/steps --width 1440 --runs 2
node "$P" step --browser <browser> --step open-filter --out <dir>/steps --do "click f1e42" --do 'wait-for "Status"'
node "$P" step --browser <browser> --step type-search --out <dir>/steps --do 'fill f1e17 "ZZ_LOOP_perf"' --do 'wait-for "ZZ_LOOP_perf"'
node "$P" build --run <dir> --app <appId> --page <pageId>
node "$P" findings --perf <dir>/perf.json --out <dir>/findings.json --check perf --page-name <Page> --run R --issues <dir>/issues.md
```

- **open** loads the page fresh with open-page for each run (a new document
  each time; the first run of a browser is on a cold cache), starts the
  observers, waits until the page is quiet (600 ms without a resource, long
  task, frame, shift or paint; 10 s at most) and writes
  `<step>.<run>.web-step.json`. `--width` first puts the preview at a
  platform size (1440, 1366 and the like; the phone width is the responsive
  check's) and the window back to that size's height, so LCP is judged in a
  real window.
- **step** marks the page, runs each `--do` as a browser.mjs command on the
  open page (`click`, `dblclick`, `fill`, `type`, `press`, `select`, `check`,
  `hover`, `mousewheel`, `wait-for`, `go-back`; refs from a fresh `snapshot`),
  waits until it is quiet and writes the step file. A step that saves runs on
  a record the run seeded (`ZZ_LOOP_…`), never on a real one, and never
  deletes or submits.
- **build** writes `perf.json` from the step files (the median of a step's
  runs, the worst step per metric) and checks it with `perf-json.mjs`'s
  `checkPerf`; exit 1 when the check finds a problem.
- **findings** turns each metric past its pass threshold into an issue of the
  `perf` check (warn minor, fail major; ids `PF<group>-<nn>`) with the `rank`,
  `metric` and `gain` keys a fix run reads, and points `perf.json` at them
  (`findings.path`, `count`), so run it after `build`: the report shows the
  findings through that pointer.

## What each number means

The metrics, their thresholds and how each is read (and what it cannot see)
are in [metrics](references/metrics.md). In short: LCP, CLS and INP use the
Core Web Vitals thresholds; TTFB, FCP, DOMContentLoaded and load come from
navigation and paint timing; long tasks fall back to long animation frames;
data-source calls are browser.mjs `calls` matched to resource timing for their
time and size; the heap is Chrome's `performance.memory`. CPU profiles are not
taken: tracing is refused in a signed-in browser, and long tasks stand in.

## Rules

- Times come from the builder preview on this laptop, the saved draft, with
  the platform's builder code loaded beside the app: compare a page with
  itself before and after a fix, never with a published app's numbers.
- A finding names its metric and the step file that holds it; a number is
  never guessed: a metric no step measured is in `unmeasured` with the reason.
- No host, query string, cookie or request body is written: paths only, and a
  duplicate call carries a 12-character hash of its body.
- One browser per test runner, closed at the end ([web-browser](../web-browser/SKILL.md)).

## References

| File | Read it when |
| --- | --- |
| [references/metrics.md](references/metrics.md) | reading a metric, a threshold or a finding, or a number looks wrong |
| [perf-json](../../native-loops/loop-orchestrator/references/perf-json.md) | reading or checking `perf.json` |
