# Writing the story

## Contents

- [Invent nothing](#invent-nothing)
- [The story, by kind](#the-story-by-kind)
- [Lines that sound human](#lines-that-sound-human)
- [Lines for a video](#lines-for-a-video)
- [One voice across the film](#one-voice-across-the-film)
- [Writing for the audience](#writing-for-the-audience)
- [What you may say about UnifyApps](#what-you-may-say-about-unifyapps)
- [What a story never does](#what-a-story-never-does)

## Invent nothing

Every figure, name, system, quote and claim comes from the material the
person gave, from the UnifyApps facts below, or from what the platform's own
knowledge says it does. The story adds only two things of its own, an
illustrative figure and a suggested plan, and labels each one.

- **A figure** goes in facts.json with its source: the file and the line, the
  call and the minute. The customer's own numbers are `customer`. Never
  round, combine or extrapolate a `customer` figure; an illustrative one
  shows its working in its `basis`.
- **Make up no figure the person did not ask for.** Where the material has
  no number, say it in words ("hours of checking every week", "most
  invoices"). A figure made up to show an idea is `illustrative`, only when
  the person asked for figures. It carries its `basis` in facts.json (how
  it is worked out: volume × time × people, from what the person gave or a
  published rate that is itself a `research` fact), and its scene's
  footnote says "Illustrative figures". Before it goes in, do the sum the
  viewer would: per person, per day, per year. A figure no team could
  produce or survive is wrong, however clearly it is labelled. When the
  people, the volume or the time behind it change, work it out again.
- **A plan** (weeks, phases, a pilot) is a proposal: `plan` facts, the
  timeline's footnote says it is a suggested plan set together, and the lines
  say "a suggested plan", "around week eight", never "you will".
- **A quote** is a sentence the customer said, word for word, attributed to a
  role and where it was said. Never a person's name.
- **Their systems** are the ones they named. A system they did not name is not
  on screen.
- **Another customer's name, logo or story** appears only from material the
  person gave, and the story sheet flags it for a brand or legal check
  before it leaves the company.
- **Gaps**: what the brief wants and the material cannot back goes in the
  story sheet as a gap, never into the story as a guess.

## The story, by kind

The beats each kind of story moves through. The film plan gives each beat
its picture and its motion; the lengths are in the loop's
[film plan](../../../loops/content-loop/references/film-plan.md#length-and-pace).

**A use-case story for one client.** Built from their calls and documents;
it shows how UnifyApps would solve their problem. The title → their words →
their world today → what it costs → the turn → how UnifyApps fits → how it
works → what changes → a suggested plan → next steps → the end card.

**A story about a solution or an idea**, made from a brief rather than one
client's material. When the brief fits it, a shape that works: the problem
as people live it → how it is done today across the industry, and where
that stops → how it looks with UnifyApps → what changes → the ask → the end
card. Never name the parts ("The problem is…", "Here's how we solved it"):
each part ends on what makes the next one needed, so the film reads as one
argument. Another shape is fine when the material asks for one.

**A product demo.** A walkthrough of an app or the builder, screen by
screen. The title → the job the app does → the screens, one `screen` scene
each, with zooms and callouts on what matters → what changes for the user
→ next steps → the end card.

**A UnifyApps overview** (`"kind": "overview"`): what UnifyApps is, with some
examples, for a C-suite, a partner or a room new to it. It shows every
standard diagram, in the company deck's order, unless the person asked to
leave one out: the title → the 80/20 (`ua-eighty`) → the code-first stack
(`ua-code-first`) → the N+N problem (`ua-n-plus-n`) → the assembly-first
way out (`ua-assembly`) → the platform (`ua-platform`) → the examples (only
what the person gave) → the four ideas (`ua-four-ideas`) → how we engage
(`ua-engagement`) → where to start (`ua-principles`) → the ask → `ua-close` → the end card. A pitch for one
client's problem is a use-case story; it uses a standard diagram only where
its argument needs one.

**A teaser** (a video, 20 to 40 s). Four to six beats of one of the above;
no plan, no detail.

Each scene carries one idea, and its title makes a claim ("Six systems, wired
by hand"), never a topic ("Systems").

## Lines that sound human

- About 2.6 words a second: a 2-minute video is about 300 words. A deck's
  lines are the speaker's notes and may run longer; keep each to what is
  said while its build is on screen.
- Whole sentences, 6 to 20 words, one idea each. Fragments ("Month two. Demo
  day.") are fine in moderation; a string of them sounds slow and stretched.
- Speak to the audience: "your team", "your invoices". Contractions are
  natural: it's, you're, we'd.
- Each build is named in the line that brings it in, as it appears; a
  sentence may bring in more than one.
- The opening says what this is and for whom in one breath. Do not open on a
  bare statistic.
- Nothing feels enforced. Suggest ("we'd start with", "a suggested plan"),
  never prescribe ("you must", "you will").
- No hype words: revolutionary, game-changing, cutting-edge, seamless, unlock,
  world-class, best-in-class. No emoji. Always "UnifyApps", one word.
- Write "Pre-Sales" with that spelling and capital.

## Lines for a video

A video holds a viewer only when its picture changes with its words.
Follow these in every story with a video; the kit's motion check fails one
that breaks them badly.

- **A new beat every 2 to 3 seconds** (about 5 to 8 words): a build, or a
  part of one that lands on its own word. A 2-minute film is about 310
  words in 10 to 14 scenes; a longer film holds each scene longer, with
  more builds, never slower ones. Trim the script; never stretch the
  picture to fit it.
- **Each build on its word**, in braces when the word is not the build's
  own label: `"So {38} pile up at the door."`. A sentence may carry two or
  three builds (`"step": [2, 3]`) when it reads better whole than cut into
  captions. The lines are voiced before the scenes are built, so each
  build's window is known.
- **One short phrase per build**, and the phrase names what the build shows,
  in the build's own words: a node called "Match" arrives on "matched". When
  the natural word differs, pin it: `"cut approvals to {2 days}"`.
- **Reveal across the scene.** A scene whose builds all arrive in its first
  line, then sit while a long second line plays, reads as a slide. Split the
  line, or give it a build.
- **Name on-screen things in the line that shows them.** A word that names
  a label already on screen lights it.
- **Open on the subject.** A title card of one short line; a product demo
  reaches the product within its first scene.
- **Captions are the words, not more text.** Do not put a sentence on screen
  that the voice also says; the captions already carry it.

## One voice across the film

The lines are one script, said by one voice from the first scene to the
last; the scenes are where its pictures change. A film whose every scene
opens on a fresh topic sentence sounds like a slideshow, however good each
scene is.

- **Write the script whole, then split it into scenes.** Read every line in
  order before voicing, and again in the cue sheet's joins after.
- **Link most scenes to the one before.** Let the first line follow from
  the last: a linking word ("So", "And", "But", "That's why"), a word that
  points back ("That system…", "This is where…"), a question the scene
  answers ("Why does this work, when one model alone doesn't?"), or a
  sentence that runs across the cut (`cutOn`). Join cause to effect, "but"
  and "therefore", rather than "and then".
- **Signposts sound like slides.** "Here's how it works." or "Here's a
  day." announces a scene instead of carrying the thought on.
- **A new chapter may start fresh**, after a longer pause, when the
  listener can tell why the film moved on.
- **Pause with meaning.** The last line's `pause` sets the silence before
  the next scene: short where the thought runs on, longer before a new
  chapter or the turn.

## Writing for the audience

A story for one leader is told from where that leader sits: the pressure
they answer for, the questions they are asked, the proof they trust, and
the one question it ends on. For a use-case story or an overview whose
viewer is a leader, read that leader's file before the brief, and follow it
for the story's shape, its hero example and its words. A product demo, a
teaser, or a film for the team who do the work takes none of these files.

**Every film for a leader lands its outcomes.** How it works is not why they
would do it. Say what changes for them, in the measures they answer for (a
CFO: cost, cash, risk, the audit; a CIO: spend, control, speed to ship; a
CTO: what the team stops building and running), at the moment the film
shows how, and again before the ask. A film that explains the mechanism and
never says what the leader gains has not made its case.

| The story is for | Read |
| --- | --- |
| A CFO or finance leader: VP Finance, controller, head of accounts payable or finance operations | [audience-cfo](audience-cfo.md) |
| A CIO or IT leader: VP IT, head of enterprise applications, chief digital officer | [audience-cio](audience-cio.md) |
| A CTO or engineering leader: VP Engineering, head of platform, engineering director | [audience-cto](audience-cto.md) |

Several leaders in one room: write for the one who signs, and give each of
the others one scene that answers their question (the CFO's cost line, the
CIO's registry, the CTO's run). Another role (a CISO, a COO, a business
team): no file yet; take the closest one's shape and keep their own
questions.

All three share a spine: the mandate; the call that felt fastest; a freeze
frame and the eighteen months that followed; "the model is only 20%"; the
way out, assembly-first; the same story run again on UnifyApps; their
questions answered; each use case reusing the last; who UnifyApps is; back
to the freeze frame; how we'd start, and one question.

## What you may say about UnifyApps

These are the approved lines; use them word for word, as `unifyapps` facts
with the source given.

| Line | Source |
| --- | --- |
| UnifyApps: Agentic Automation for the Enterprise. | UnifyApps positioning |
| The Fourth Platform: the CIO's horizontal AI operating system for the enterprise. | UnifyApps positioning |
| 1,200+ connectors, plus MCP and A2A servers. | The UnifyApps story |
| One platform, one login: builders, contexts and governance on the same brain. | The UnifyApps story |
| More than a thousand connectors. | UnifyApps films, Nov 2026 |
| Three contexts, built once: knowledge, integrations and governance, meeting in the Enterprise Context Graph. | UnifyApps films, Nov 2026 |
| Assembly-first: governance, knowledge and actionability built once; every agent snaps together from reusable apps, atomic agents and atomic workflows. | UnifyApps films, Nov 2026 |
| More than a thousand people, in New York, Dubai, Gurugram, Paris and Melbourne. | UnifyApps films, Nov 2026 |
| ISO certified for security and privacy, SOC 2 and SOC 1 Type 2, and GDPR compliant, independently audited every year. | UnifyApps Security Overview, Nov 2026 |
| Partnered with AWS, Microsoft, Google and IBM. | UnifyApps films, Nov 2026 |
| More than a hundred enterprises in production, not pilots, from banking and healthcare to retail, manufacturing and the public sector. | UnifyApps films, Nov 2026 |

The platform, as a `platform` scene may name it: **Builders** (agents, apps,
workflows), **Enterprise Brain** (action context, context graph),
**Governance**. Of investors, say "backed by marquee investors", never a
list, in the story's own words.

**The standard diagrams.** The UnifyApps platform story's diagrams (the
80/20, the code-first stack, the N+N problem, the assembly-first
architecture, the one platform and its Enterprise Context Graph, the four
ideas, the engagement model, the three principles) are
scenes of their own: see [the standard diagrams](unifyapps-standards.md). A
story that needs one uses its scene as it stands. Its words, figures and
pictures are the company's standard deck, so they need no fact in
facts.json; never draw one again with another scene, which the check
refuses. For the company's vision, the framing for an industry or a leader, and
customer stories like the client's, read
[UnifyApps, from its own site](unifyapps-site.md); these lines still win
where the site gives a different number.

For what the platform can do in this use case (a connector to SAP, an
approval step, a document reader), read the platform's own knowledge
(`mcp__plugin_ua_application-builder__get_app_builder_knowledge`,
`mcp__plugin_ua_automation-code__search_operations` for a connector's
operations) and say only what it confirms. A capability you cannot confirm
is a gap.

## What a story never does

- Use a figure the team has retired: "11,000+ capabilities" is not true.
- Open on "95% of GenAI projects never get past the pilot".
- Show a customer's staff names, a real person, or another company's logo or
  wordmark in a screenshot. Crop it or use illustrative data, and say so.
- Draw or rebuild the UnifyApps logo, or show it with the ™ mark. Use the
  kit's [logo files](../SKILL.md#the-unifyapps-logo).
- Reuse a case study from a confidential deck without the brand or legal
  check named in the story sheet.
