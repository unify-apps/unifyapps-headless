# Compare a performance change

Use this for an A/B comparison or a claim that a change improved performance.
A broad audit may collect observations without making such a claim.

## Before measuring

Write the hypothesis, target metric, useful improvement threshold and required
correctness checks in the job brief before seeing the results. Choose the
smallest representative case first. Derive the threshold from the request,
existing requirements or a stated reversible working assumption. Ask only if
that choice materially changes the requested outcome.

Verify access, test-user permissions, fixture size and editability, navigation,
and the reserved device and connection. Save the route so another run does
not rediscover it. A missing prerequisite blocks measurement, not the whole
run's independent work. Follow [run execution](execution.md).

## Prove and match each variant

For both baseline and changed runs, record:

- Build, app and page configuration version, and proof of the loaded
  variant: the device-step protocol's fresh-config proof on MOBILE
  ([protocol](../../native-device-pool/references/protocol.md) step 6), open-page's
  `loadedAt` after the read-back on WEB. A successful save or a navigation
  back to the page is not proof.
- Device, build mode, test user and fixture, row count and selected state.
- Open kind, warm-up, cache and network state, background refresh state,
  measurement start and end events, and instrumentation enabled.

Recheck version proof after each save, reload or bundle switch. Confirm the
expected visible state too when the variant changes the UI. Old probes or an
unexpected layout invalidate the run until explained. Do not blame or remove
the proposed change based on a mismatched run.

Hold these conditions steady and change one variable at a time. Keep first
opens separate from repeats. Wait for unrelated background work before both
variants, or deliberately include the same work in both. An older-session
baseline is context, not evidence of this change's effect.

## Run and decide

Alternate baseline and changed runs where practical to expose warm-up or
session drift. Keep every raw value with its variant and run order. Follow
the timed-step minimum in [shared rules](rules.md#measurement),
and report the sample count, median and spread. If noise prevents a decision,
mark the comparison inconclusive. Collect more samples only while they can
answer a named uncertainty within the remaining budget.

Run every required correctness check as well as timing. Include edits,
selection and row-state isolation when list reuse or identity changes.
A view-only fixture cannot prove an editing check. Missing checks keep the
experiment incomplete even when its speed numbers look better.

Record keep, revert, or blocked with raw evidence and the next check. Distinguish
observed differences from their suspected cause. Remove temporary probes and
profiling hooks after capture, verify cleanup, and restore test data under the
existing undo rules. A diagnostic run with extra hooks is not a clean timing
baseline. Do not leave instrumentation active between unrelated experiments.
