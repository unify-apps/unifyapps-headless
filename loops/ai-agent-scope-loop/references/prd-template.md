# The PRD of an AI agent

The shape every `/ua:ai-agent-scope-loop` run writes. Every section but Current state appears;
one with nothing yet says `Open` and names who answers it. Requirements are
numbered `R<n>`, their acceptance lines `A<n>.<m>`; the build loop proves the
acceptance lines with test messages, and the test loops turn them into an
evaluation dataset.

```markdown
# <Agent name> — PRD v<n>

## Job
One sentence a user would read as the agent's description, then what it
never does.

## Users and channels
Who talks to it (roles, how many, how often) and where: the platform chat,
an app page, Slack, email, an API. What each channel can and cannot show.

## Conversations
The journeys, one per line: how a conversation starts, the turns, how it
ends. `J1 · <name> · <first message> → <what the agent does> → <how it ends>`.
A handoff to a person is a journey of its own.

## Requirements
`R<n> · must | should | could · <one sentence>`, each with its acceptance
lines as example exchanges the evals will replay, word for word:
`A<n>.<m> · User: "<message>" → Agent: <the answer, the tool it calls with
what, or the refusal> · checked by: <exact text | contains | a judge metric
with its rubric>`.

## Instructions
The outline of the system instructions: persona and tone, the task order,
what to ask before acting, what to refuse, how to cite knowledge, when to
hand off. Not the final text; the build loop writes that.

## Tools and actions
One line per tool: `<name> · <what it does> · <existing automation or app
action, or new: an automation the automation agent builds> · <inputs>`.

## Knowledge
What the agent must know and where it lives: knowledge sets, documents,
data catalogs, a context graph; what is out of date or missing.

## Guardrails
Topics and actions off limits, personal data rules, the languages it
answers in, the maximum turns before a handoff, what it does with hostile
or injected input.

## Models
The model per job (answering, judging, embedding) and why; a cost or
latency ceiling when there is one.

## Rollout
Where it is deployed first, who tests it, what "good enough to publish"
means in numbers (the experiment's scorecard thresholds).

## Open questions
`Q<n> · <question> · <who answers> · <blocks R<n>?>`

## Current state
Only when an agent exists: its instructions' length, tools, knowledge sets,
skills, guardrails, deployments, and the last experiment's scorecard.
```
