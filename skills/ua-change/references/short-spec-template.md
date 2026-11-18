# Short spec (owner-replaceable wording; parsed headings fixed)

For a change that creates an entity, deletes one or needs a page `job` line. Required: a `#` title, `## Requested outcome`, `## Touches` and `## Ready when`. Leave `mode` out of the frontmatter.

```markdown
# <Title>

## Requested outcome
<Two to four lines: who does what, what they see, why.>

## Touches
- <object|automation|app|code-app|page|connection|ai-agent|knowledge-set|dataset|metric|experiment|api_group|api|client|access_profile|policy|env_variable|connector|graph> · <name> · <id or "new">

## Contract
- <kind> · <create|update|delete|seed> · <name>: <exact values>

## Business rules
- <One rule per line.>

## Ready when
- <Observable result in the person's words.>
- deploy <automation name>
- publish <app, code app or AI agent name>

## Assumptions
- Check this: <each value taken from defaults.md or a read, not from the person>
```

What each part needs:

- **Contract.** One line per entity per operation. A `record · seed` line lists every row the build writes. A picklist lists its codes with labels (`status: to_do "To Do", in_progress "In Progress"`). A date says epoch ms. A page line gives an address that ends in a plain word. A `connection` line becomes a `manual` task. A `code-app` line names the screens and files that change and what each does. [tasks.md § Tasks from the Contract](tasks.md) turns the lines into tasks.
- **Context graph.** A change to a context graph adds the `### Context graph` part at the end of `## Contract`, in the exact format of the plan skill's `spec-template.md` § Context graph. Load `context-graph-design` to write it.
- **Page lines.** A new no-code app needs an `app look · <app>:` line above every `job · <page>:` line. Each new page needs a `job` line and a `design · <page>:` block. Pages that pass values between them get one `state · <app>:` line. Load `app-page-planner` to write them.
- **Ready when.** One `deploy` or `publish` line per release, naming its `## Touches` entry. The confirm covers exactly these lines.
- **Assumptions.** Every default chosen without asking, `Check this` lines first.
- Literal angle brackets that are not a placeholder go in a code span, or the spec is refused as raw HTML.
