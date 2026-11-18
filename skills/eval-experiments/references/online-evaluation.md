# Online Evaluation

**This file is a pointer for a person, not something you can act on.** Online
evaluation has no entity type, no settings record, no alert record and no
endpoint, and no tool in this skill or any sibling reaches it. It lives on the
**agent**, under `Observability`, and **not** in the Evaluation section beside
Datasets, Metrics and Experiments — so anyone hunting for it there will not find
it. It grades real production traffic continuously, where an experiment grades a
dataset you curated on demand. Everything here describes the screens in the product
guide, not a stored shape — so treat every name as a UI label *(unverified)*. When someone asks
for online evaluation, say where it lives and what it does, hand them the guide,
and do not improvise a route to it through the experiment tools.

Only two things below belong to a reader of *this* skill: its other name, and
what is not known. Its configuration is the other feature's
surface and is not described here.

## The two names for one feature

`Online Evaluation` is the product name for continuously grading real production
traffic. The same producer is also called **"online governance evaluation"**.
Almost certainly one feature under two names: record it as an alias rather than
inventing a second feature. Its one consequence for a reader of *this* skill is
that a stored test-case run now carries the keys both producers write, which is
why the shape in [runs-and-scoring.md](runs-and-scoring.md), "Test-case runs",
covers online evaluation's rows as well as an experiment's.

## What is not known

No entity type, no settings record, no alert record, no endpoint, and no channel
named beyond `Email`. Whether online evaluation writes `test_case_runs` under the
same `runId` / `experimentId` keys an experiment run uses is unconfirmed — what is
known says the two producers share the endpoints, not that they share the key
shape. Do not build anything against this surface without reading a record
first.
