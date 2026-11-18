# PRD reviewer brief

Each round of the [prd stage](../../../skills/native-loops/loop-orchestrator/references/stages/prd.md)
starts one fresh general-purpose agent with this brief. It did not write the
PRD, so it reads it the way a builder will: looking for what it would have
to guess. It changes nothing and asks the person nothing.

## The prompt

Copy this, with the real paths written in:

```
You review one PRD before a team builds a mobile app from it. You did not
write it. Change nothing; ask nobody. Read:
- the PRD: <R>/prd.md
- its required shape: <plugin>/loops/native-scope-loop/references/prd-template.md
- the readiness check's answer: <R>/reviews/check-<n>.json
- the person's words and sources: <R>/brief/sources.md
Write your review to <R>/reviews/round-<n>.md in the shape below, then reply
with its path and the verdict only.
```

## What to look for

1. **Roles.** Every role in Users and roles takes part in a journey, and a
   journey names no role the section lacks. What a denied role sees is said.
2. **Journeys.** Every step happens on a named screen. Every branch (approve
   or decline, found or empty) has its result.
3. **Requirements.** Each one is one thing a person can do or see. Each
   acceptance line names its steps and what the phone or a record then shows.
   A must requirement has a line for its failure or boundary. No line says
   "works", "correctly" or "as expected".
4. **Screens.** Each screen serves a requirement, says its job, and names its
   loading, empty and error states. A screen with a design frame keeps the
   frame's link.
5. **Data.** Every field a screen shows or a rule reads is in Data, with who
   writes it. Picklist values are listed.
6. **Rules and failures.** Duplicates, overlaps, limits and state changes are
   said once, in Rules. Invalid input, no network, a denied action and a
   failed outside call each say what the person sees and how they recover.
7. **Mobile.** Notifications (who gets one, when, what tapping it opens),
   offline use, device permissions (camera, location, photos), and deep links,
   where the app needs them.
8. **Numbers.** Volumes, time limits and sizes wherever Quality or a rule
   depends on them.
9. **Contradictions.** A requirement that needs what Scope puts out, two
   sections that disagree, an extension that changes what Current state says
   other screens rely on.

Not your job: visual design, the choice of objects or automations, tool
names, or rewording what is already clear.

## The review's shape

```markdown
# Review · round <n>

Verdict: ready | gaps

## Blocking
- <section> · <id or —> · <what is missing or wrong> · <what a builder would have to guess>

## Advisory
- <section> · <id or —> · <what would make it better>

## Questions for the person
- <question> · options: <a> | <b> | <c> · fills: <section and id>
```

`ready` means no blocking finding. At most four questions, each one a
decision only the person can make, with two to four options, the likeliest
first. A finding the readiness check already names is not repeated.
