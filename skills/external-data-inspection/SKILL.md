---
user-invocable: false
name: external-data-inspection
description: MANDATORY load before configuring external connector-based workflow steps. Use to understand how to resolve values and when and what to ask the user.
---

# How to inspect data stored in external connector systems?

Use this flow for writing and configuring external connector app nodes, and
to inspect the live user data stored in those apps. This gives you a richer context,
and allows you to ask smarter, more meaningful questions about the user's data and business
decisions, along with implementation decisions.

## Resolve connections first

**Do not ask the user any data related questions, until the connector is resolved.**

Identify the connectors required by the request. A connector with `needsAuthentication: false` has no connection to resolve. When a connection id is provided,
then use that connection id for every node, unless otherwise specified.

Otherwise call `list_connections` for the required connectors. Use a single
active match only when the result is complete. When several connections match,
ask the user for clarification using the `RequestClarification` tool, and never
assume the connector user "might" want to use.

## Inspect live app data

Read `get_operation_schema` for each candidate operation. Use the selected
connection and established parent values to inspect the user's live app data.

When a brief or user supplies a record's exact key, keep that key through every
read and write. Filter by the declared key alone; a display field such as an
account name is not an identity fallback, even when it is populated. Before
using a returned record or its id in another step, compare its key with the
requested value. Treat no match or a mismatch as a failed lookup, not a record
to update. Ask the user to choose only when the intended record is ambiguous.

There are two ways to get data and insights:

1. **Running lookups:** for field values in operation schema DSL, some fields get their
   data from lookups, which you can yourself trigger using the tool `run_lookup` and get the
   values from the tool result. Use these values to get potential values, and confirm with the user
   with `RequestClarification`.
2. **Running connector operations directly:** for operations that return data, you can trigger them using
   the tool `run_connector_operation` and get the results from the tool result. This is useful for
   executing SQL queries, fetching tables, schemas, users, records, and other read, list, fetch like information

### Running lookups

- For an input backed by `LookupWidget`, copy its `ua:payload` from the operation
  layout and call `run_lookup`. Pass the selected connection when required.
- Resolve dependent lookups in order. Discover a parent resource before looking
  up its children.

### Running connector operations

- Use a bounded read-only connector operation only when schema inspection and
  lookups cannot reveal the needed data and the request authorizes reading it.
- The operations you run using the tool can be completely independent of the actual
  workflow that we are building, and rather are only called to gather data and build context.
- Always prefer this way to get data, rather than making dummy workflows that do this for you.

When a connector exposes stable IDs, use ID fields to search, filter, and identify
connections, resources, and records. Treat names and other display values as useful
context for matching a result to the user's description, not as identifiers when an
ID is available.

When writing a value with its source, citation, generated-by, or verification status,
derive those fields from the branch that actually produced the value. An intended AI
step does not make a typed fallback AI-generated, and a completed write does not make
an unverified comparison verified. Cite only sources that the workflow read and used
for that value. If a model result is missing or cannot be parsed, fail the step unless
the brief explicitly permits a fallback; label any permitted fallback for what it is.

### Discovering what a connected system holds

- Read the system's own catalogue once: one listing that returns every object **and** its
  fields for the area you need. Never probe names one at a time by trying them - one listing
  replaces dozens of guesses.
- When `run_connector_operation` fails, the provider's own message is in the result's
  `errorDetails.body`; the top-level `error` may only say `HTTP 500`. Read it before the next call.
- If that message cannot be fixed by changing your input - a refusal by the read-only check, a
  suspended or unpaid account, a missing permission - stop and tell the user, quoting it. Do not
  retry variations.
- When code tools are available, read the catalogue, check the candidates and run the test in
  one script.

**IMPORTANT**: Use the tool only for fetching and listing data, do not cause
mutations or updates.

## User clarification hygeine

**Do not ask the user for ids**, names, tables, fields, or other values that these
reads can discover. A tool result establishes available candidates. It establishes
the intended choice only when one candidate uniquely matches the user's description.

Never pick channels, boards, emails, records, tickets or any data resource present
in the connector application - always ask the user to pick once, unless otherwise
asked "not to ask questions".

### Examples

**Correct**

1. Asking which slack channel to send alerts to
2. Asking which Jira/Monday project/board to use
3. Asking which GitHub repository to push to, etc.

**Incorrect**

1. Assuming slack channels, users, etc.
2. Assuming Jira/Monday boards, projects, tickets, etc.
3. Assuming GitHub/BitBucket/GitLab repositories, PRs, etc.

After discovery, ask only about ambiguity that would change the workflow. Always
ask when several connections, automations, or app objects match the description.
In a _user-facing conversation_, use `RequestClarification` with clickable options
from the live results. You can ask multiple questions at once, but do not hesitate
to ask one at a time.

Ask the questions in layer, resolve the decisions that need to be first, and then ask
the next layer of questions. **NEVER** ask questions from different layers at the same time.

**IMPORTANT**:
If the user explicitly asks for no questions, or the caller says no user can
respond, use reasonable assumptions from the discovered data and report them.
Never invent an identifier or continue past a value required for a correct save.

## Guideline Process

1. Start with resolving the connector id. If already present in the brief, the use that,
   else clarify with the user by providing them options of available connectors.
2. Ask user questions about the user data, and connector action related information.
   Plan your questions, and ask in layers. Do not ask dependent questions that
   should be in different layers.
3. Ask 2-3 round of questions, and resolve decisions. It can be 1 round if the brief
   is clear enough, or no rounds. Do not stretch for more than 3 rounds, make plausible
   assumptions after round 3 and build away.
