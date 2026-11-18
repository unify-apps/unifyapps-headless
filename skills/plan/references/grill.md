# Grill and pre-mortem

## Contents

- When to grill
- 1. Grill the graph
- 2. Classify each discovery
- 3. Pre-mortem (short)
- 4. The checklist

## When to grill

Only in an in-depth plan.

| Grill | Skip |
|---|---|
| 5 or more tasks | Fewer than 5 tasks |
| An `unknown` row left in the impact | Every impact row is `found` or `no-change` |
| A change to stored data (field rename, type change, delete, backfill) | No stored data changes |

Any one in the left column means grill. Sorting a discovery during a run (§2) applies to every plan.

## 1. Grill the graph

Apply §4 to the spec, the reads, the impact rows and the task graph. Re-read any fact you are not sure of. Check:

- every `found` impact row has a task, and every task has a read-back proof
- every Ready when line has its deploy, publish or code-publish task
- no task depends on something it does not use

## 2. Classify each discovery

Prefer absorbing. A plan can change a lot without reopening the spec.

| Level | Use when | Do |
|---|---|---|
| **Absorbed** | The spec stays true. No new permission, delete, release or surface type. No person-only decision beyond one bounded yes. Done work stays valid. At most half of the remaining tasks change their kind, entity or dependencies, and at most two tasks are added. New words in a title, body or proof do not count, nor an entity id a done task reported, nor a deploy or publish that now also waits on a task this revise adds. | Fix the graph quietly. For a stored plan, wait until no task is `running`, then `plan revise <planId> --tasks-file <json> --impact absorbed --reason "<discovery>" [--evidence-file <json>] --json`. |
| **Major plan change** | The spec stays true, but the change is bigger than that, or it needs a deploy or publish the spec's `## Ready when` does not name. | Stop sending. Show what is done and the new writes. Ask `Add to this change` or `Stop here`, naming each new release and the tenant. Same plan: `plan revise ... --impact major`, and for a new release add `--ready-when "<deploy or publish line>; …" --release-yes "<their own words>"`, which adds the lines to the accepted spec. A new plan, only when the person asks: `plan fork` (the running source becomes `interrupted`). `Stop here`: `plan finish --user-requested`. |
| **Requirement change** | New facts change accepted behaviour, scope, rules, access, a data contract, Proof, or a Ready when line other than a new release, or need a new decision from the person. | Stop sending. `plan interrupt <planId> --reason "<change>"` when a plan exists. Tell the person. Go back to reads and questions. Keep the old spec, and propose the replacement with `plan propose ... --derived-from <old specId>`. Its tasks account for the writes the old plan already made. |

A **bounded yes** (a person-only decision that keeps the outcome and touches one task) is not a requirement change. The builder reports `needs_confirmation`, the router asks, and `plan task <id> --answer` records it. Revise as absorbed when the answer changes the graph.

## 3. Pre-mortem (short)

Imagine the change already failed at its first real use. What went wrong?

1. List the likely failure reasons yourself first: a binding, node or field that breaks, a consumer never read, a READ row that is a guess, a task with no read-back.
2. Sort each one:

| Class | Meaning | Do |
|---|---|---|
| Tiger | Real, with evidence | Add one task, one read or one guard, or get a fact from the person |
| Paper tiger | A read or a spec line disproves it | Name that read or line |
| Elephant | Known but unspoken, such as a scope exclusion | Say it plainly to the person |

3. Keep fixes small: one read, one branch or one task, never a new subsystem.
4. Ask the person only for facts the reads cannot give. A question that would change behaviour is a requirement change.

Write the results to the evidence file, one line per risk:

```text
premortem | tiger | <risk> | evidence: <read> | mitigation: <task id or answer>
premortem | paper tiger | <risk> | disproved by: <read or spec line>
premortem | elephant | <risk> | decision: <task id or accepted reason>
```

Before a plan is saved, each tiger becomes a task, a read or a guard in the tasks file, and each elephant a line in the spec. Save the evidence file with the plan: `plan propose ... --save --hash <hash> --evidence-file <json>`. For a stored plan, pass the file with `plan revise ... --evidence-file <json>` or `plan fork ... --evidence-file <json>`. The evidence file is a JSON array of strings, one string per cited proof line above — never one combined block of text.

## 4. The checklist

`plan propose` already checks the dependency rules it can ([task-kinds.md § Dependency rules](../../ua-change/references/task-kinds.md#dependency-rules)). Check the rest against live reads. Record one evidence line per meaningful pass or fix.

- Requested outcome and `## Ready when` describe visible behaviour, failure branches included.
- Every touched entity has a READ row, and every new name its exact check.
- Object fields, uniqueness, links, required values and existing row counts are explicit.
- Automation inputs, outputs, result words, tests and deploy state match their consumers.
- Page bindings, data sources, callbacks and navigation match the automation contract.
- Connection scopes or auth are read where an automation needs them.
- Every task starts with a read and quotes a read-back proof.
- Every body follows [task-kinds.md § Facts every body follows](../../ua-change/references/task-kinds.md#facts-every-body-follows).
- Each dependency is one the task body uses. No page-layout waits on backend work.
- A bind that waits only on a shell has no proof that needs real output. That proof goes on the publish.
- A code app is read with `get_code_app` (its `head`, `gitLinked` and deployment); its tasks name the screens and files they change, two tasks on one app wait one on the other, and its `code-publish` waits on every `code-app` task of the app (dependency rule 18).
- Failure, duplicate, missing record, access and partial response cases have a visible branch or an explicit unverified check.
- Tigers have a mitigation task or an answer, paper tigers a disproving read, elephants a named decision.
