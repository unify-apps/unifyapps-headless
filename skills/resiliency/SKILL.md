---
user-invocable: false
name: resiliency
description: Read when an automation needs node-level error handling, retries, rate limiting, partial-failure behavior, or recovery from connector and platform failures.
---

# Resiliency

Choose failure behavior before retries or throttling. Keep it on the failing operation; use a scope only for a shared multi-node boundary.

## Handle node errors

Every `op(...)` supports a node-level policy:

- Fail: omit `onError` or use `"STOP"` when downstream work is unsafe.
- Continue: use `"CONTINUE"` only when later nodes do not need the failed output. Report the partial failure.
- Error path: wrap the operation in `try/catch`; the compiler emits `MANUAL` and separate edges. One operation needs no `scope(...)`.

```ts
try {
  op('payments', 'charge', input);
  op('storage_by_unifyapps', 'mark_paid', successInput);
} catch {
  op('storage_by_unifyapps', 'record_charge_failure', failureInput);
}
```

Use `scope(op(...), () => { ... })` only when the protected unit contains several operations. Do not set `onError: "MANUAL"` by itself; without an error branch it does not describe a complete recovery path.

## Match the message to the observed outcome

Choose user-facing copy from the actual result or error reason. A returned result with no match, attribution, or records is not a thrown node error. Do not describe an empty result as bad input or poor quality unless the upstream result says that explicitly. Keep business rejection, a usable result with no target match, and a technical failure on separate paths. Give each a next step that fits its cause; retry only when the failure is transient.

For example, normalize the real response into declared boolean inputs before this Groovy code node. `usable` must come from the quality verdict, and `targetAttributed` must come from checking the requested target in the response's attribution data. Do not infer either value from an empty downstream list.

```groovy
def userMessage
if (usable == false) {
  userMessage = "This photo was judged unclear. Retake it in better lighting."
} else if (targetAttributed == false) {
  userMessage = "This photo was not linked to the requested check. Verify the check details or contact support. Uploading it again may not change the result."
} else {
  userMessage = "This photo was matched to the requested check."
}
result = [userMessage: userMessage]
```

The code node's `input` schema and `parameters` must declare and map both booleans; its `output` schema must declare `userMessage`. If the scoring operation throws before returning a result, handle that exception separately with `try/catch`; do not classify it as unclear or unattributed. Explain the service or workflow problem on that error path. Adapt copy to the application's real next steps.

## Retry a node

Put `retryConfig` directly in the operation options. A scope is not required.

```ts
op('slack', 'send_message', input, {
  retryConfig: {
    enabled: true,
    count: 3,
    initialDelay: 1_000,
    maxDelay: 8_000,
    backOffFactor: 2,
    captureRetries: true,
  },
});
```

Use those exact keys. `count` is 0 through 5, delays are milliseconds, and `backOffFactor` is 1 through 5 with a capital `O`.

Retry transient failures only. Do not retry invalid input, permissions, missing schemas, or business rejection. Retry mutations only when idempotent or proven not to have happened. A timeout may hide a successful effect.

## Limit a node's rate

Put `rateLimitConfig` directly in the operation options:

```ts
op('vendor_api', 'create_record', input, {
  rateLimitConfig: {
    enabled: true,
    threshold: '100',
    duration: '1',
    unit: 'MINUTES',
    waitForNextWindow: true,
    key: 'tenant',
    incrementParameter: '1',
  },
});
```

- `threshold` is the capacity in one window; `duration` and `unit` define that window.
- Use uppercase Java time units. Prefer `MINUTES`, `HOURS`, or `DAYS` unless a sub-minute window is intentional.
- Set `waitForNextWindow: true` when the node should wait for capacity. Set it to `false` when exceeding the limit should fail immediately and follow the node's error policy.
- `key` selects a literal partition such as tenant or connection; it is not a formula. Without it, executions share one bucket.
- Use `incrementParameter` when one execution consumes more than one unit. Both it and the other dynamic string fields may contain formulas.

Rate limits control admission; retries repeat work. Bound both to prevent a retry storm.

## Preserve business state

- Validate before the first mutation.
- Update success markers only after the owned effect succeeds.
- Keep independent records isolated when partial progress is allowed.
- Record failed item identifiers, causes, and retry evidence.
- A called automation runs its deployed definition. Verify its contract and deployment before depending on its result.

Use `automation-run-debugging` for run evidence and repair. Before a mutating test or rerun, obtain confirmation and name the possible effects.
