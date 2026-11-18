# Finding loops

A loop is a job with a goal, steps, a check after each step and a rule for
when it is done, that someone will run again. Look for these signs in the
sessions. They are listed strongest first.

## What makes a candidate

| Sign | Where it shows |
| --- | --- |
| The same run of tools, more than once | the digest's `Repeats` line; the same tool names in several turns; one job done for several pages, objects or records |
| A check after each step | a read-back, a test run, a screenshot or a query right after a write |
| Corrections by the person | "no, do it like…", a plan rejected, a value fixed by hand: each is a rule the loop must hold |
| A stop the person named | "until every page passes", "for all the open tickets" |
| The same ask in several sessions | the same first request in several digests, or the same command typed |

A candidate needs three things: a goal someone will have again, steps that
can be written down without the session in front of you, and a check per
step. One that lacks any of them is not a loop. If it was the closest, say
why in one line.

## What is not a loop

- A one-off fix: the cause will not come back.
- A question answered by reading: no steps to repeat.
- A job a `/ua:` loop already runs. The person's version of it may still
  hold a rule the shipped loop lacks: say that rule, and suggest
  `/ua:give-feedback` so it reaches the loop.
- Steps that only worked because of that day's data or a platform outage.

## Turning the session into stages

- One stage per phase of the job, such as find, change, report. Not one
  stage per tool call. Every stage ends with its own check.
- Keep the order the session found worked. A step the person had to redo
  goes in the way that finally worked, with the reason, so the loop does
  not repeat the first try.
- A correction becomes a rule in the stage it applies to, in the person's
  words when they are clear.
- A question the session asked the person and the answer it got: when the
  answer will be the same next time, it is a default; when it will not, it
  is an input or a gate.
- Anything done by hand more than twice, or any calculation, becomes a
  script. Anything long the stage reads but does not change (a field list, a
  checklist, a made-up sample) becomes a reference.
- Writes, deploys and publishes stay behind the person's yes, as they were
  in the session. A delete always does.
