# The metric library

Read this when you are picking, adding or naming a ready-made metric, or need to know what
each template grades and what it needs. For what a metric is and how it scores, stay in
SKILL.md.

## Contents

- [What the library is](#what-the-library-is) — what a template holds, and how adding one works
- [The library by kind](#the-library-by-kind) — 29 templates by metric kind and test-case kind
- [The 25 LLM metrics](#the-25-llm-metrics) — the complete table with grader, required inputs and type · scale, and why the library's 0–10 is true of templates and not of metrics people write
- [The 4 conversational metrics](#the-4-conversational-metrics) — the `Relavancy` misspelling, and where `turns` and `role` stand
- [The six Automation-graded metrics](#the-six-automation-graded-metrics) — the ones to copy from
- [Picking metrics](#picking-metrics) — matching the goal, and the cost of adding more

## What the library is

`Explore Library` on the Metrics page opens `…/evaluation/metrics/library`, described as
"Leverage our pre-built metrics library to effortlessly evaluate any AI Agent across
standard performance parameters". Each card has an `Add` button; adding copies the template
into your workspace as a metric of your own, which remembers the template it came from.

A library entry is a stricter record than the metric you end up with. A template always
declares its kind, its test-case kind and its input parameters; on a metric of your own, all
three are optional and nothing refuses a metric that has none of them. So a copy of a template
starts out complete, and a metric built from scratch does not.

`get_metric_library` reads the templates. They are immutable: you copy one and change the copy.

## The library by kind

The library ships **29 templates, 23 AI and 6 Automation** — `PROGRAMMATIC`,
`HUMAN_IN_THE_LOOP` and `DERIVED` are absent from the library altogether rather than present
with a zero — and **25 LLM against 4 conversational**. The product guide's "29 metrics, 25 LLM
and 4 conversational, six grading through an automation" describes the same library, so quote
either with confidence. The library grows between releases; read it rather than treating these
counts as permanent.

| Metric Type facet | Count |
|---|---|
| AI (LLM as a judge) | 23 |
| Automation | 6 |
| Programmatic | 0 |
| Human in the loop | 0 |
| Derived Metric | 0 |

| Test Case Type facet | Count |
|---|---|
| LLM | 25 |
| Conversational | 4 |

Two things follow. The library is overwhelmingly AI judges — if someone wants a human grader
or a derived formula, there is no template to start from, they are building it. And only four
templates are conversational, so a multi-turn dataset will mostly need custom metrics.

Most metrics in a working workspace are custom or cloned rather than library copies — the
library is a starting point, not the catalogue of what people actually run.

## The 25 LLM metrics

`Needs` is the compatibility contract: every parameter listed has to exist as a column on the
dataset's test cases before the metric means anything. Read this column before the description.
Pick a metric whose needs your dataset does not meet and nothing errors at save — at run time
every case comes back **missing a parameter**, with a reason naming the field (see SKILL.md
§ "A metric names no dataset"; the product guide describes this as a silently meaningless
score instead, and the missing-parameter state is the version to act on).

`Type · Scale` is the template's evaluation type and the score range it ships with.

| Metric | What it checks | Grader | Needs | Type · Scale |
|---|---|---|---|---|
| `Answer Relevancy` | Whether the answer was relevant to the question. | AI | Input · Actual Output | SCALE `[0,10]` |
| `Faithfulness` | Whether the response is grounded in the retrieved context. | AI | Input · Actual Output · Retrieval Context | SCALE `[0,10]` |
| `Hallucination` | Whether the answer contains fabricated information that contradicts the context. | AI | Input · Context · Actual Output | SCALE `[0,10]` |
| `Contextual Precision` | Whether the RAG pipeline fetched irrelevant context. | AI | Input · Actual Output · Expected Output · Retrieval Context | SCALE `[0,10]` |
| `Contextual Relevancy` | Whether what was retrieved is relevant to the input. | AI | Input · Retrieval Context | SCALE `[0,10]` |
| `Task Completion` | Whether the model actually completed the user's task. | AI | Input · Actual Output · Tools Called | SCALE `[0,10]` |
| `Tool Correctness` | Whether every required tool was called — optionally with the right inputs, outputs and order. | AI | Input · Actual Output · Tools Called · Expected Tools | SCALE `[0,10]` |
| `Prompt Alignment` | Whether the output follows every instruction in the prompt. | AI | Input · Actual Output | SCALE `[0,10]` |
| `Toxicity` | Whether the answer contains toxic or harmful language. | AI | Input · Actual Output | SCALE `[0,10]` |
| `Bias` | Whether the answer contains gender, racial or political bias. | AI | Input · Actual Output | SCALE `[0,10]` |
| `QA` | Whether the output fully and correctly answers the question, against a reference. | AI | Input · Actual Output · Expected Output | BINARY `[0,1]` |
| `AI vs Human (Groundtruth)` | Compares the AI answer to a human-written one — the RAG benchmarking metric. | AI | Input · Actual Output · Expected Output | BINARY `[0,1]` |
| `Summarization` | Whether a summary accurately reflects the source document. | AI | Input · Actual Output | BINARY `[0,1]` |
| `Citation Evals` | Whether the reference links offered alongside an answer hold up. | AI | Input · Actual Output | BINARY `[0,1]` |
| `Json Correctness` | Whether the output matches the expected JSON schema. | AI | Input · Actual Output | BINARY `[0,1]` |
| `SQL Generation` | Whether generated SQL correctly answers the question. | AI | Input | BINARY `[0,1]` |
| `Code Generation` | Correctness and readability of generated code. | AI | Input | BINARY `[0,1]` |
| `User Frustration` | Whether the user is showing frustration. | AI | Input · Actual Output · Expected Output | BINARY `[0,1]` |
| `BERT Score` | BERT similarity between the answer and the expected answer. | AI | Actual Output · Expected Output | SCALE `[0,1]` |
| `Check Accuracy` | Whether actual output equals expected output. | Automation | Actual Output · Expected Output | BINARY `[0,1]` |
| `Cosine Similarity` | Semantic similarity between two embeddings. | Automation | Actual Output · Expected Output | SCALE `[0,10]` |
| `Embedding Similarity` | Cosine similarity of input and output embeddings. | Automation | Actual Output · Expected Output | SCALE `[0,10]` |
| `Language Mismatch` | Whether two texts are in the same language. | Automation | Actual Output · Expected Output | BINARY `[0,1]` |
| `Text to SQL` | Similarity between the expected and the actual SQL query. | Automation | Actual Output · Expected Output | SCALE `[1,5]` |
| `Chunk Overlap` | Overlap between input chunks. | Automation | Input | BINARY `[0,1]` |

`Toxicity` and `Bias` are two separate library entries, not one `Toxicity / Bias` row — name
them individually when you recommend them.

**On ranges, the library is the population the "0–10" line is true of, and the metrics people
write for themselves are not.** Counting the whole library, 16 templates are `SCALE` and **14
of those 16 are `[0,10]`** (`Text to SQL` is `[1,5]` and `BERT Score` is `[0,1]`), while the 13
`BINARY` templates are all `[0,1]` — so the product guide's "most scale metrics run 0–10" is
accurate **about templates**.

It is not a safe assumption about a metric someone wrote. A range is chosen per metric and they
vary widely — `[0,1]`, `[1,5]`, `[0,10]` and `[1,10]` are all ordinary, and narrower ones like
`[1,3]` turn up — which is why SKILL.md § "Evaluation type and range, and why scores never compare across metrics"
refuses a cross-metric comparison. Quote the guide for templates, read the metric for anything
else.

The evaluation type itself is a closed set of three — `SCALE`, `BINARY` and `STAR`, with no
fourth value — and the create flow offers `STAR` on a human-in-the-loop metric only, which is
why no AI or Automation template above carries it.

## The 4 conversational metrics

All four are AI-graded, and all four require a `CONVERSATIONAL` dataset — `testCaseType` makes
that a hard constraint, not a convention.

| Metric | What it checks | Needs | Type · Scale |
|---|---|---|---|
| `Conversation Completeness` | Whether the agent satisfies the user's needs across an end-to-end conversation. | Input · Actual Output | SCALE `[0,10]` |
| `Conversation Relavancy` | Whether responses stay relevant throughout the conversation, not just on the first turn. | Input · Actual Output | SCALE `[0,10]` |
| `Knowledge Retention` | Whether the agent remembers and correctly applies facts shared earlier in the conversation. | Input · Actual Output | BINARY `[0,1]` |
| `Role Adherence` | Whether the agent stays in its assigned role for the whole conversation. | Input · Actual Output | BINARY `[0,1]` |

**`Conversation Relavancy` is spelled that way in the platform** — a live typo in the stored
`name`, not a transcription error here. Searching the library for `Relevancy` returns zero
rows. Name it as stored. (Its id is the correctly spelled `conversation_relevancy`, so the id
and the name disagree; search by the misspelled name, fetch by the correct slug.)

**On `turns` and `role`.** All four conversational templates declare exactly
`INPUT · ACTUAL_OUTPUT`, and **no library template of the 29 declares `turns` or `role` at
all.** Those two parameters appear only on *custom* metrics: they are available to a
conversational metric, not required by a template.

## The six Automation-graded metrics

Six of the 29 grade through an automation rather than a judge model, which closes the
Automation facet count of 6 exactly:

`Check Accuracy` · `Cosine Similarity` · `Embedding Similarity` · `Language Mismatch` ·
`Text to SQL` · `Chunk Overlap`

These are the reference implementations. Do not start a custom Automation metric from a blank
automation — open one of the six and look at how its automation takes the ticked parameters in
and hands the score back. The runtime contract it has to honour is in SKILL.md
§ "Five kinds of judge, four you can make".

## Picking metrics

Pick metrics that match the goal and add none nobody will look at — that is the common
failure. Three or four beat ten. For accuracy, Faithfulness plus Answer Relevancy; for safety,
Toxicity plus Bias. Use `BINARY` metrics as gates and `SCALE` metrics to track movement between
runs. Keep the judge model fixed while you iterate — an AI metric's scores are only comparable
across runs if the ruler does not change. Reserve human-in-the-loop for judgements automation
genuinely cannot make; it is powerful and slow. Watch cost and latency alongside quality — a
better answer that costs three times as much may not be worth shipping, which is what the
`latency` and `cost` parameters are for.

**Do not mark the route when you meant to mark the result.** `Tool Correctness` can be asked for
the right tools with the right inputs in the right order, and every extra demand fails an answer
that reached the same place another way. The same applies to an exact-match comparison on a
number or on free text where more than one wording is correct. Mark what genuinely had to be
true, and leave the agent the parts that did not.

**Give partial credit where a task has parts.** A case with four requirements graded as one
yes-or-no throws away the three that were met, and two runs that both "failed" stop being
comparable at all. A `SCALE` metric, or a derived metric weighting one metric per requirement,
keeps that information.
