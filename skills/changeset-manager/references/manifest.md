# The manifest, and the platform's statuses in plain words

## The manifest

Shown once before the `Send` or `Export` question, in this order, as plain
Markdown. Every line comes from `review_changeset`'s answer; nothing is
inferred.

```
**<Move|Export>: <name>** → <destination environment, or "a file">

What goes
- <kind> · <name> (<version, for an automation; records, for an object>)
- …

Needed by what goes
- <kind> · <name> — needed by <name of what needed it>
- …

Before you send
- <warning, one per line, naming the asset>
- …
```

Leave out `Needed by what goes` when there are no dependencies, and
`Before you send` when there are no warnings. A `truncated: true` answer
is an incomplete list: add one line naming why (`stoppedAt` is `rounds`
or `assets`), `The dependency search stopped at <rounds|assets>; this
list is incomplete and a changeset saved from it arrives with missing
dependencies.`, and offer to narrow what moves or to send the rest in a
second changeset rather than sending the cut list.

The same text is the `preview` of the `Send` or `Export` option in the
question that follows, and the question line carries its counts:
`Send 5 assets (3 chosen, 2 needed by them, 1 warning) to QA?`. The
person sees the manifest in the chat and inside the dialog.

## Outbound statuses

| Status | Say |
|---|---|
| DRAFT | saved, not sent |
| SCANNING | the secret scan is running |
| SCANNED | scanned; the scan's own status says whether it may be sent |
| EXPORTING | the platform is packing it |
| SUBMITTED | delivered to each destination, where it waits for approval or deploys on arrival |
| APPROVED | approved on the destination, not yet deployed there |
| REJECTED | rejected on the destination |
| DEPLOYED | deployed on the destination |
| DEPLOYMENT_FAILED | the destination tried to deploy it and some assets failed; `get_changeset` names them |
| ROLLED_BACK | the destination rolled it back |
| CANCELLED | cancelled from here |
| FAILED | the platform could not pack or send it; `statusReason` says why; clone it to try again |

The scan's own statuses: `PASSED`, `PASSED_WITH_WARNINGS`, `NOT_REQUIRED`,
`SKIPPED` and `OVERRIDDEN` let it be sent; `BLOCKED` holds it until a fix
or an override; `ERROR` needs a rescan.

## Per-asset outcomes on a destination

`DEPLOYED`, `FAILED`, `UNDEPLOYED` (arrived, not yet deployed), `SKIPPED`
(the destination keeps its own copy), `REPLACED` (mapped to one of the
destination's own, usually a connection) and `ROLLED_BACK`; `assetType`
says whether the asset was `NEW` there or `EXISTING`.
