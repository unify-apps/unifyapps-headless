# The spec

Used by the [plan skill](../SKILL.md) once the open questions are settled, and for a replacement spec. The shape and heading rules are in [spec-template.md](spec-template.md).

## What to do, when it is needed

- **Write** the Markdown at `.sessions/<sessionId>/drafts/<spec-slug>.md`.
- **Check** it with `spec check --md-file <path> --json` as soon as it is written. Fix what it refuses. Fix the real gaps its warnings name.
- **Show it first** when it settles decisions the person has not seen, such as a marked guess. Give a short plain summary and ask, for example `Accept final spec` or `Request changes`. On changes: apply, check, show again. This is a review, not the yes to build. Otherwise go straight to the tasks.
- **The visual page** only when the person asked for it: add `--html` to `spec draft`, or to `spec revise` for a saved spec. The CLI renders it from the Markdown; never write HTML. With `--html` the Contract needs one `### <kind> · <name>` heading per Touches entity and its relation bullets ([spec-template.md](spec-template.md) § The visual page). The `plan propose --preview` page is a different page.
- **Store it** with the plan. `plan propose --file <spec.md> --tasks-file <tasks.json> --save --hash <hash>` runs `spec draft` and `spec accept` itself, after the person's one yes. Deploy and publish lines the preview named need no second yes. Any other release asks first.

## Later changes

- A plan-only change stays in the plan. The spec is not touched.
- A change to what was accepted: keep the old spec, ask the changed decisions again, write a full replacement, and propose it through `plan propose ... --derived-from <old specId>`.
- To edit an accepted spec in place: `spec revise <specId> --md-file <path> [--html] --note "<why>" --json`.
