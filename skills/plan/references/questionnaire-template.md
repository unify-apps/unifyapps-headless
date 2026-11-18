# Questions and the settled-decision ledger

## Contents
- Where it lives
- Question types
- Stable decision keys and deduplication

## Where it lives

Keep one ledger per change, as long as the change has decisions:

```text
.sessions/<sessionId>/questionnaires/<spec-slug>/ledger.md
```

Each time you ask, add the questions to it, then record the answers. Skip the file when nothing was asked.

```markdown
# <spec title> — decisions

## Settled decisions

| Decision key | Source | Answer or evidence | Checklist rows |
|---|---|---|---|
| <subject.decision> | USER, READ, or N/A | <specific settled meaning> | <row ids, optional> |

## Questions

### <Q-slug>

- Decision key: `<subject.decision>`
- Type: `select` | `multiselect` | `text`
- Why: <what it changes in the spec>
- Question: <one concrete decision>
- Options: <labels and short descriptions, or `Free text`>
- Recommended: <one option, or `None`>
- Answer: <value, or `Unanswered`>
- Status: `open` | `answered` | `superseded`
```

## Question types

Ask with AskUserQuestion, as the [plan skill](../SKILL.md) § Ask with options says. Up to four questions per dialog, grouped by topic.

- `select`: one option. Mark the recommended one when it is safe.
- `multiselect`: several options. Say whether none is allowed.
- `text`: free text, only for a value no list can hold (a name, a link, a description). Give a short example, but do not make it the default.

## Stable decision keys and deduplication

Give each question a key that names the decision, such as `orders.access.edit_roles`. Before you ask, compare its meaning with:

1. the request and the conversation
2. the named reads
3. every row of the ledger

Leave it out when it is already settled, even in other words. When an answer shows a new, narrower decision, give it a new key. When new evidence makes an old answer wrong, mark it `superseded`, keep it, and ask only the changed decision. Never delete a valid answered question or ask it again.
