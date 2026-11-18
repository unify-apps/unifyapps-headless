# Writing for a CTO

Read this when the story is for a CTO or an engineering leader (VP
Engineering, head of platform, engineering director). It sets what they
answer for, what they need to see, and the shape of a film that holds them.
The numbers in the example lines are the shape of the claim; every figure in
a real story still needs its fact and source.

## Contents

- [What they answer for](#what-they-answer-for)
- [The story they live](#the-story-they-live)
- [What they need to see](#what-they-need-to-see)
- [Their hero example](#their-hero-example)
- [Words](#words)
- [The film's shape](#the-films-shape)

## What they answer for

- **How code really gets written**, and how long a hard ticket takes from
  arrival to a reviewed fix.
- **Knowledge that lives in a few heads:** which customers depend on which
  function, why a test exists, what broke last spring. Every hard ticket
  waits for one of those people.
- **AI assistants that made more code, not more throughput:** pull requests
  up, the same reviewers, every engineer prompting differently, nothing
  learned written down; fixes that are fast and generic, patching a symptom
  and breaking a caller nobody showed the assistant.
- **What they can't see:** which code an agent wrote, what a fix cost, who
  approved what went to production, whether the team is any faster.
- **Two questions that change the work:** who designs the work, and what
  does the agent know before it starts?

## The story they live

1. A priority-one ticket, and the engineer's nine tabs (support desk,
   customer record, repository, chat, last incident, runbook).
2. Writing the fix takes an hour; finding the context and getting review
   takes days.
3. The knowledge isn't written down.
4. Then we added AI in the editor; week one felt great.
5. Month three: more pull requests, a longer review queue.
6. The fast, generic fix that broke a second feature for another customer.
7. As the leader: none of it is visible.
8. Typing was never the bottleneck. The two questions.

## What they need to see

They believe a product screen over a diagram, so this film is mostly the
product at work, on screens built to match the real product and marked
"Illustrative data".

| Beat | Show | Scene |
| --- | --- | --- |
| One ticket today | the ticket, the tabs opening one by one, a time bar: an hour to write, days to find and review | screen, stats |
| Where the knowledge lives | notes that live in a few people; the queue in front of them | points |
| AI in the editor | the diff, the green test, then pull requests up and review time doubled | stats |
| What it never saw | what the assistant saw against what it missed, and the broken report | before-after |
| What I can't see | four questions with empty answers | points |
| The loop | an engineer-designed loop: trigger, steps, a test that must fail first, a judge, limits, one human gate | screen, flow |
| Grounding | the context graph: node types, then the records merging into one, with owner, contract and history | screen |
| The ticket arrives | the graph already knows the customer's value, renewal, promise and the past incident; the loop starts on its own | screen |
| From words to one function | the graph walking from the customer's words to the function, its recent change and every caller | screen |
| Same agent, different brief | context off: one line; context on: a five-line brief | screen |
| The run | failing test, fix, checks in three time zones, judge sends it back, green, a person approves, a draft pull request | screen, flow |
| Now you can see it | the four questions answered: loop and agent on every pull request, cost per run, who approved, time per ticket | points |
| Scale | indicative monthly numbers, labelled as such | stats |

Use the person's own stack only in general words in the voice (support
desk, chat, repository, AI assistant), never vendor names. Story data is
fictional and labelled; numbers on product screens are "Illustrative data",
scale numbers "Indicative".

## Their hero example

One priority-one bug, end to end: the ticket starts the loop with nobody
pressing Run; the graph walks from the customer's words to the function and
everything that calls it; the agent gets a five-line brief instead of one
line; the loop runs a failing test, a fix, a check across callers and time
zones, a judge, a second pass; a person approves the push; it ends with
drafts for review (the pull request, a reply to the customer, a new memory)
and, once promoted, every agent starts with what was learned.

## Words

- **Use:** ticket, priority one, the review queue, callers, tests, fails
  before, a judge, limits, a gate, a person approves, a draft pull request,
  loops, memory, the context graph, grounded, the brief, cost per run.
- **Avoid:** vendor names in the voice, "AI factory" or other internal
  names for the suite unless the person uses them, unlabelled numbers, and
  any line that says engineers go away: they design the loops, promote what
  agents learn and approve at the gates.

## The film's shape

A full film runs about 7 to 8 minutes in three parts: the problem in the
CTO's own voice, the platform, then the suite at work on product screens. A
2 to 3 minute cut keeps the ticket, the generic fix, the two questions, the
loop, the brief, the run and the ask.

1. How code gets written, a CTO's view.
2. A ticket today; where the knowledge lives; then we added AI; more code,
   the same reviewers; fast and generic; what I can't see; two questions.
3. Introducing UnifyApps: one platform; the suite on it.
4. The suite at work: the loop; ground it; the ticket starts the loop; from
   words to one function; how your team works; same agent, different brief;
   the loop runs; the work builds on itself.
5. Now you can see it; every loop, every day (indicative).
6. Who UnifyApps is (the approved credentials only).
7. Back to that ticket, and one question: "Which loop do you want running
   first?"
