# Ask only what is unclear

Used after the reads, before the spec. Inputs: the READ table and `impact` rows ([reads.md](reads.md)), memory, the feature docs of the touched entities, and the conversation.

## Rules

- Ask as few questions as the change needs. Often zero.
- Any number of rounds. Stop asking when nothing important is unclear.
- Never ask the same decision twice. Keep the settled-decision ledger.
- Never label your own guess as the person's decision. Put a safe guess in the spec, marked as a guess, so the person sees it.

## What to do, when it is needed

- **List what is still unclear.** Go through the request, the reads and each `impact` row. An `unknown` row is unclear until a live read settles it. [requirements-checklist.md](requirements-checklist.md) is a thinking aid: skip rows that do not apply.
- **Split a big request** with several unrelated outcomes. Say so, and plan one change at a time.
- **Data model.** A change that adds an object, or changes object fields or links: load `object-schema-designer` before you pick a design.
- **Ask** only the decisions only the person can make. [questionnaire-template.md](questionnaire-template.md) gives the question shape and the ledger.
- **A new entity named?** Go back to [reads.md](reads.md) for it before you settle anything that depends on it.
- **When nothing important is unclear,** write the spec Markdown in the shape of [spec-template.md](spec-template.md) and hand over to [spec.md](spec.md).

## Good questions

| Do | Do not |
|---|---|
| One decision per question | Mix unrelated decisions |
| Concrete options, a safe default marked | Ask open "what do you want?" questions |
| Ask about purpose, limits, what success looks like | Ask for a fact a read can give |
| A small throwaway HTML mockup when seeing beats reading | Ask whether the person wants a mockup |

## Page design

`app-page-planner` designs the `app look`, `job` and `design` lines itself. Ask about a job only when the request and the reads leave its first question or main action open.
