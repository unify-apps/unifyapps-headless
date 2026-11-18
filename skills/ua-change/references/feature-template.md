# Feature doc default

Each feature doc is its own `solution_document` record, linked by `solutionId`. It renders locally as `docs/automations/<slug>.md` (automations), `docs/applications/<slug>.md` (apps and pages) or `docs/features/<slug>.md` (other surfaces). Upsert with `feature upsert --file <json> --json` after a plan drains normally. A user-requested close skips it.

The upsert file's fields are exactly: `name` (string), `slug` (optional, defaults from the name), `summary` (string), `entities` (array of `{kind, name}`), `planIds` (array of plan id strings, not objects) and `body` (the Markdown as one string). Never put a `document` field in it: the CLI builds that column.

Keep apps and automations in separate documents. When a plan changes both, write one document per app and one per automation, each with its own name, slug, summary, `entities`, user-visible behaviour, business rules and the plan that changed it.

Read matching docs while planning. When a newer plan touched an entity, treat the doc as possibly behind and check live state. Keep enough entity references and behaviour for a future builder to tell what is current.
