# The UnifyApps standard diagrams

The UnifyApps Platform Story in the Demo Library is the company's standard
presentation. Its diagrams are the ones most UnifyApps stories need: why the
model is only 20%, what a code-first stack costs, why it does not scale, the
assembly-first way out, the one platform with its Enterprise Context Graph,
the four ideas behind it, how an engagement runs, the three principles, and
who built the company. Each is a scene of the kit, `ua-<name>`, with the
deck's own words, figures, pictures and motion.

When a story needs one of them, use its scene as it stands. Never draw it
again with a flow, a hub, stats or points: `D check` refuses a scene whose
words name a standard diagram and says which scene to use. For any idea the
standards do not hold, choose from the kit's other scenes as usual.

## Contents

- [Using a standard scene](#using-a-standard-scene)
- [The diagrams](#the-diagrams)
- [A UnifyApps overview shows all nine](#a-unifyapps-overview-shows-all-nine)
- [What each build shows](#what-each-build-shows)
- [Which one for which beat](#which-one-for-which-beat)
- [Pictures, names and figures](#pictures-names-and-figures)

## Using a standard scene

```json
{ "id": "eighty", "type": "ua-eighty", "ground": "deep", "data": {},
  "say": ["The model is only 20%. Everything else is the 80%.",
          "Knowledge, governance, actionability, workflows, apps and agents.",
          "A plane needs a great engine, but Boeing is not Rolls-Royce."] }
```

- `data` is empty: the content is fixed. `ua-code-first` alone takes one
  option, `stack`.
- Write one line per build, in the order of the table below, naming what
  that build shows, so the video lands each build on its word.
- Each looks its best on the ground the deck gives it (the table's Ground);
  both grounds lay out clean.
- Every one keeps moving while it holds: wires carry their current, the
  centre glows, the current stage pings.

## The diagrams

| Scene | Shows | Builds | Ground |
| --- | --- | --- | --- |
| `ua-eighty` | The 80/20 of enterprise AI: the model is 20%, the other 80% breaks into six layers | 3 | deep |
| `ua-code-first` | What building the 80% on your own takes: a five-layer stack wired to every system, then its cost, its attack surfaces and the pilot it gets stuck in | 6 | paper |
| `ua-n-plus-n` | The N, N+1, N+N problem: each new agent needs the six layers of tools again | 5 | paper |
| `ua-assembly` | The assembly-first architecture: three universal contexts built once, agents snapping together from reusable blocks, each use case shipping faster | 5 | deep |
| `ua-platform` | One platform, every builder on the same brain: three builders, the Enterprise Context Graph, three contexts, governance around them, the customer's systems plugged in | 5 | paper |
| `ua-four-ideas` | The four ideas: the Enterprise Brain, workflow by design, assembly first, governance at every layer | 5 | deep |
| `ua-engagement` | The engagement model: six stages from the intro session to production, what each side brings, and who leads delivery deal by deal | 8 | deep |
| `ua-principles` | Start with the P&L: three habits replaced by three principles, then outcomes moving the P&L | 7 | paper |
| `ua-close` | Stop hand-building, start assembling: assemble, ground, govern | 2 | deep |

`ua-code-first`'s `stack` picks whose stack is drawn: `"best-of-breed"`
(the default), `"salesforce"`, `"microsoft"` or `"google"`. Use the
client's own vendor when the material names one.

## What each build shows

- **ua-eighty**: (1) the 20% and the 80% counting up; (2) the 80% breaking
  into knowledge, governance, actionability, workflows, apps and agents;
  (3) "A plane needs a great engine, but Boeing is not Rolls-Royce."
- **ua-code-first**: (1) the stack, layer by layer; (2) every layer wired to
  the systems of record, activity and knowledge; (3) "a code-first
  approach", hand-built layer by layer; (4) cost before value in year one;
  (5) every connection an attack surface; (6) stuck in pilot.
- **ua-n-plus-n**: (1) agent 1 and its six layers of tools; (2) agent 2,
  the same tools again; (3) agent 3; (4) the duplication; (5) why it cannot
  scale.
- **ua-assembly**: (1) the governance, knowledge and actionability
  contexts; (2) agent 1 snapping together from reusable apps, agents and
  workflows; (3) to (5) the next use case shipped, from 12 weeks down to 3.
- **ua-platform**: (1) the three builders; (2) the Enterprise Context
  Graph; (3) the three contexts; (4) the context graph traced to every
  builder; (5) governance and the systems plugged in.
- **ua-four-ideas**: (1) the Enterprise Brain; (2) workflow by design;
  (3) assembly first against code first; (4) the glass box; (5) "from
  renting brains to owning the mind".
- **ua-engagement**: (1) the six stages; (2) to (7) each stage in turn:
  intro session, discovery, use case selection, PoC, commercial and value
  alignment, production and scale; (8) who leads delivery, deal by deal.
- **ua-principles**: (1) to (3) technology-first becomes outcome-first,
  entity-first becomes workflow-first, code-first becomes assembly-first;
  (4) the P&L; (5) to (7) grow revenue, reduce cost, manage risk.
- **ua-close**: (1) "Stop hand-building. Start assembling."; (2) assemble,
  ground, govern.

## A UnifyApps overview shows all nine

A story that explains what UnifyApps is (`"kind": "overview"`: a
capabilities story for a C-suite, a partner or a room new to it, with some
examples) shows every standard diagram, in the order of the table above,
with its examples after `ua-platform`. Leave one out only when the person
asked, and write their words in story.json's `without`; `D check` refuses
an overview missing one without them, or with them out of order. A
use-case story or a product demo uses only the ones its argument needs.

## Which one for which beat

| Beat | Standard scene |
| --- | --- |
| Why AI pilots stall | `ua-eighty`, then `ua-code-first` |
| Why building it yourself does not scale | `ua-n-plus-n` |
| The way out, the architecture | `ua-assembly` |
| What UnifyApps is | `ua-platform` |
| The recap of an overview | `ua-four-ideas` |
| How we work with a partner or a client | `ua-engagement` |
| Where to start, for a leader | `ua-principles` |
| The close of an overview | `ua-close`, before the end card |

A client story uses one or two of them where its argument needs them.

## Pictures, names and figures

- The standard diagrams carry no pictures: vendors, systems and products
  are named in text.
- A standard scene's lines may say the figures it shows with no fact in
  facts.json; any other figure in its lines still needs one.
