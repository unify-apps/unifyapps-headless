# Recipe: near-realtime refresh

## Contents

- When
- Questions for the person
- Entities
- Security
- Performance
- Acceptance checks
- Limits

A region refreshes itself every few seconds, so a change someone else makes
shows without a reload. A Timer block ticks, and its event triggers the
region's data source again. It is not push: a change shows after up to one
interval. The [realtime push](realtime-push.md) recipe holds what to ask
about true push, and falls back to this one.

## When

"Update the approvals list in real time", "refresh automatically", "live
status", "show new requests without reloading", "keep the counts current".

## Questions for the person

1. **How fresh.** Default: every 15 s. Options: 15 s · 30 s · 60 s · only
   when the person comes back to the page (no timer).
2. **Which region.** Default: the region the person named, matched to its
   data source with `ua cache ds`. Option: the regions I name.
3. **How many people keep the page open at once.** Default: under 100. It
   sizes the load (§ Performance), and over 1000 the interval is asked
   again.

## Entities

| # | Kind | What | Builder | Knowledge it loads |
| --- | --- | --- | --- | --- |
| 1 | page bind | A `timer` block on the page (the shared Timer), with no countdown the person sees; never behind a visibility condition, which is not proven to keep it ticking. Its event triggers the region's source: `controlDataSource {dataSourceId, method: "trigger"}`, that source only | `ua:app-agent` | `ua:app-design`, `ua:app-page-build`, `ua:app-native`; the sheets `blocks/timer` and `actions/control-data-source` |
| 2 | automation (change, only when needed) | The region's automation must be cheap enough to run every interval: filtered, sorted and bounded at the source. When `ua cache wf <id> --contract` and its read show it fetches everything, a task makes it so, with the same contract | `ua:automation-agent` | `ua:data-fetching`, `ua:performance` |
| 3 | object (change, only when needed) | An index on the field the automation filters or sorts the list by, when it has none | `ua:fde-agent` | `ua:object-storage-manager`; planned with `ua:object-schema-designer` |

How the timer repeats is the `blocks/timer` sheet's: the catalog says only
that it emits events on tick and on completion. When a tick comes every
second, the refresh goes on the completion of a countdown of the interval
that starts again, never on every tick. The builder reads the sheet and
says which in its report.

## Security

- **The same call.** The refresh calls the same automation with the same
  inputs, so its owner check holds. No input is added, and never a user id.
- **No new reader.** The timer adds no data source that reads more than the
  region already shows.

## Performance

- **Say the load.** One call per open page per interval: 100 people with the
  page open at 15 s is 400 calls a minute to the automation. The plan
  preview says the number.
- **One source per tick.** Only the region's source, never every source on
  the page (P10: one network refresh per interaction).
- **Never a source that seeds the page's state.** A source whose `onSuccess`
  sets page variables sets them again on every tick and drops what the
  person typed since (the reason `refetchOnWindowFocus` is off on such a
  source). Split it: the list's source refreshes, the state source does not.
- **No flash.** The region's loader shows only while its source has no data
  yet, so a refresh does not blank the list (X1, and `app-native`'s loading
  rule).
- **Slower than the interval.** When the source takes longer than a third of
  the interval, the interval is asked again: UnifyApps Headless does not know whether a
  new trigger waits for the call still running.

## Acceptance checks

1. **`realtime`: a change on device 1 shows on device 2 within the interval.**

   ```
   - Watcher: <Page with the region> · <pageId> — <route>; signed in as <test user 2, or the same test user>
   - Writes: one change to the test record ZZ_LOOP_build_<n>, as the test user — allowed in the run settings
   1. Open <the page that changes it> (<route>)
   2. Set <field> of ZZ_LOOP_build_<n> to "<new value>"
   3. Tap Save

   Effects:
   - record <Object> (<object id>) · <test record id> · <field> = <new value>

   Watch:
   - device 2 shows "<new value>" within <interval + 5> s
   ```

   Device 2, a second simulator, is never touched: the change must show on
   its own.

## Limits

- **The Timer** is a shared component on MOBILE.
- **Draft sources:** the Preview app runs the draft, so the realtime check
  needs no publish. If a new source still answers `forbidden datasource`
  (`native-lint` trap T19), the line stays not proven on a device, with that
  reason; the loop never asks to publish.
- **Unknown:** whether the timer keeps ticking while the app is in the
  background.
- **Unknown:** how often the timer ticks and how it repeats (the
  `blocks/timer` sheet).
- **Not push:** a change shows after up to one interval, never at once.
