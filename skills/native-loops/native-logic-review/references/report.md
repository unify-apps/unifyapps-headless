# Report

Two files in `$OUT`: `review.json` for tools, `review.md` for the person.

## review.json

```json
{
  "page": { "id": "e_page_home", "name": "Home", "version": 42, "appId": "app_demo" },
  "path": "simulator",
  "pathReason": "ua-sim-01 has the Preview app (release-embedded)",
  "purpose": "Signed-in member sees today's bookings and opens one",
  "groups": { "logic": "findings", "redundant": "findings", "interactions": "clean", "blocks": "findings", "ui": "unverified" },
  "findings": [
    {
      "id": "F1",
      "group": "interactions",
      "severity": "blocking",
      "source": "R8",
      "where": { "kind": "block", "name": "bookNow", "id": "b_bookNow" },
      "saw": "Tapping Book now does nothing",
      "why": "The main action of the page cannot be used",
      "fix": "Add onClick → trigger createBooking, then navigate to Confirmation",
      "evidence": ["tap at (0.5,0.82) · describe before and after identical · draft v42 · network-logs refetch 10:41"],
      "status": "proven"
    }
  ],
  "dropped": [{ "source": "R4", "id": "b_promo", "reason": "Hidden on purpose until the campaign starts; the person said so" }]
}
```

`severity` is `blocking` (a person hits it), `prune` (extra config, safe to remove), or `minor`. `status` is `proven` (evidence attached) or `unverified` (with the reason). `source` is the lint rule (H), the prune rule (R), the UnifyApps Headless config-review group, or `review` for a finding from [checks](checks.md). `dropped` lists every lint or prune finding you checked and did not report, with the reason: a reviewer can see it was looked at.

## review.md

Lead with one plain sentence: how many findings, how many block a person, how many can be pruned, and the path taken. Then one table, blocking first, then prune, then minor:

| # | Severity | Where | What we saw | Why it matters | Fix | Proof |
| --- | --- | --- | --- | --- | --- | --- |

Then one line per `unverified` group with the reason. Short sentences, common words.
