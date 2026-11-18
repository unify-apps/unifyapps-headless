# Derived metrics

Read this when a `DERIVED` metric has to be designed, read, changed, or when any metric is
about to be deleted. The one rule that stays in SKILL.md is the score ladder's
derived carve-out: `-1` is a legitimate score on a `DERIVED` metric.

**Derived metrics are rare.**

A `DERIVED` metric has no judge. It computes a score from other metrics' scores, and is stored as
two keys inside `metricConfig`:

- `base_metrics: string[]` — the metric ids it reads
- `formula: string` — the expression, referencing each base metric as a `{{id}}` token

Seven things about it are decisions, not accidents:

1. **The range is server-owned** — the minimum and maximum a derived score can take, not the
   evaluation type. The server computes it from the `formula` and its
   `base_metrics` and hands it back; a rejected formula is a validation error, not something to
   patch around locally. The interval is real-valued and often surprising — five metrics scored 1–10 give
   **5–50**, a division can give **0.33–5.33** — and your threshold has to fall inside it. If
   the range looks wrong, the formula is wrong, not the threshold.
2. **A derived metric cannot be a base metric.** The candidate list excludes
   `properties_type IN [DERIVED]` — a recursion guard — and for an `LLM` derived metric also
   restricts candidates to the same `testCaseType`. Nothing refuses a derived metric sent
   directly as a base, so do not send one.
3. **The formula backend evaluates plain math, not spreadsheet functions.** The Excel-style `=`
   helper is explicitly disabled. Write `({{a}} + {{b}}) / 2`, not `AVERAGE(...)`.
4. **Formula-id matching is whole-token, not substring**, because one metric id can be a prefix of
   another. Anything deciding "is this metric still referenced" must match delimited tokens.
5. **`-1` is a legitimate derived score**, not a not-scored sentinel — see the score ladder in
   SKILL.md. Point 1 is why: a server-computed interval like `0.33–5.33` can legitimately contain
   negatives, so no small negative number is a sentinel here.
6. **Deleting a base metric breaks it silently on the platform.** The platform checks nothing
   on the way out. `delete_metrics` does the check for you: called without `confirm`, it
   reports every derived metric and experiment that still reads the ids, and it refuses any id
   something still reads. `get_metric_details` shows the same `dependents` for one metric.
7. **The base metrics still run.** A derived metric combines scores; it does not replace the
   graders that produce them. Five base metrics means **five graders per test case**, with the
   cost and the latency that implies. Combine metrics you were going to run anyway.
