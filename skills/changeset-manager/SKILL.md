---
user-invocable: false
name: changeset-manager
description: Moves UnifyApps assets to another environment as a changeset, or exports them to a file, through the changeset MCP server, as the signed-in person. Finds the assets the person named, closes their dependencies, warns about what arrives changed, shows one manifest, and on the person's yes saves the draft and sends it (submit, secret scan, publish) or exports it; answers questions about where an outbound changeset is. Use when the person asks to move, ship, promote, migrate or export apps, automations, objects, agents or any other asset to another environment or to a file, or asks where a changeset is.
---

# Changeset manager — move or export assets, from the source side

A changeset is the platform's release package: it copies chosen assets from
this tenant to a paired environment (a MOVE), or into a password-protected
file (an EXPORT). You run the source side only, with the `changeset` MCP
server's tools, as the person. The destination tenant is never touched:
what arrives there is approved and deployed on its own Inbound page.

## Rules that never bend

Read these first. Every section below follows them.

1. **One yes, recorded.** A changeset is saved, sent or exported only
   after the person's `Send` or `Export` in this skill's own question, and
   only once `changeset confirm` has recorded that answer. NEVER send or
   export without the record. NEVER run `changeset confirm` to get past a
   refusal: a refusal means the question was skipped, so ask it.
2. **The manifest is a chat message.** Before every Send or Export
   question, write the manifest as plain chat text. The dialog preview is
   in addition to it, never instead of it.
3. **Dialog options are copied, not written.** Every AskUserQuestion in
   this skill has its options fixed in a literal block below. Copy the
   labels and descriptions verbatim. NEVER rename, reword, reorder, add or
   remove an option, and NEVER invent a third path.
4. **A password goes into `save_changeset` and nowhere else.** Never into
   chat, the trace file, memory, a report or any other tool, and a typed
   password is never repeated back.
5. **The destination tenant is never touched.** Approving, deploying and
   rolling back stay on its Inbound page.

## Where it runs

Run this skill in the main Claude session, never
inside a plan builder and never as a plan task. It asks the person
questions, and every send or export needs their yes. It is not a Build:
nothing on this tenant changes, so there is no brainstorm, spec or plan,
and the solution is not refreshed or written. A changeset may carry any
asset on the tenant, not only what the open solution links.

## Read order

1. Load the `changeset` server's tools with one ToolSearch, `select:`
   followed by these names, comma-separated:
   `mcp__plugin_ua_changeset__get_changeset_options`,
   `mcp__plugin_ua_changeset__search_assets`,
   `mcp__plugin_ua_changeset__review_changeset`,
   `mcp__plugin_ua_changeset__get_changeset`,
   `mcp__plugin_ua_changeset__list_changesets`,
   `mcp__plugin_ua_changeset__save_changeset`,
   `mcp__plugin_ua_changeset__send_changeset`,
   `mcp__plugin_ua_changeset__export_changeset`,
   `mcp__plugin_ua_changeset__revert_changeset_to_draft`,
   `mcp__plugin_ua_changeset__clone_changeset`,
   `mcp__plugin_ua_changeset__delete_changeset`.
2. Call `get_changeset_options` first, once. It answers the asset classes
   this tenant lets into a changeset, the secret-scan settings, the paired
   environments, the two UI flags and whether an export automation exists.
   - A MOVE with no `environments`: say that no environment is paired with
     this tenant, that an admin pairs one in Settings → Change Sets →
     Connected Systems, and stop.
   - An EXPORT with `exportShown: false`: say the tenant hides Export in its
     UI and stop; `unknown` goes on.
3. Read [references/manifest.md](references/manifest.md) before showing the
   manifest.

## Find the assets

The person names what to move in words. Turn the words into assets, each
with its `assetClass` and id:

| They say | Find it by |
|---|---|
| names, "the Orders app and its automations" | `search_assets` with `query` and, when the kind is clear, `kinds`; a `deployed` flag comes back on automations |
| a builder link | the id in the link; the kind from its path (`interfaces` → `e_interface`, `automations` → `WORKFLOW_DEFINITION`, `objects` → `ENTITY_TYPE`, `ai-agents` → `ai_agent`) |
| "this solution", "everything we built" | the solution record itself, `assetClass: e_solution` with the id from `solution context --json`, plus its apps, automations, objects and agents from `entity context solution --json`, all as requested assets in one `review_changeset` call: the platform closes what the record links (its automations, apps and objects, then their theme, identity provider and connections), and the cache adds what the platform does not link to the record (an AI agent, today), so nothing in the solution is left behind |
| a solution id (`e_…` from a solutions link, or typed) or another solution's name | `assetClass: e_solution` with that id; a name goes through `solution resolve "<name>" --tenant <host>` first. The platform closes everything the record links. Say in one line that the id is taken as a solution, since an AI agent id has the same shape; the platform answers an unknown id with no error and no dependencies, so a solution whose review finds nothing under it is empty or wrong: say so, offer nothing to send, and ask for the name |
| "what plan X built" | `plan get <id> --json`: the ids its done tasks reported |
| "same as last time" | `list_changesets`, then `clone_changeset`; the clone is a new draft, so it goes through Review and its own question like any other |
| a page | pages travel inside their app: name the app, and say so |

Ask only when one name matches more than one asset; show the matches by
kind and name and let the person pick. Never ask for an id.

## Choices

Decide these before the review, asking only what the request leaves open:

- **Destinations** (MOVE only): one `environments` entry. A tenant may
  hold hundreds of pairings, several pointing at one host under names
  different people gave them, so when the request names a place, call
  `get_changeset_options` again with `environmentQuery` set to that word
  and offer the matches by name, newest first; ask when more than one
  remains, or when the request names none.
- **Automation versions**: the default is the latest deployed version, or
  the last save for one never deployed; a specific deployed version only
  when the person names it.
- **Records** (objects only, when `recordsMovable` is not false): default
  none. Ask only when the request mentions data or records.
- **Type**: read it from the words. It is an EXPORT when the request says
  a file, a zip, an export or a download; it is a MOVE when the request
  names a destination environment (to/into/onto a place) or says move,
  ship, promote or migrate. When the request names **neither** a file nor
  a destination, it is ambiguous: NEVER guess or default; ask one
  AskUserQuestion with exactly these options, copied verbatim (rule 3).
  When the words settle it, do not ask.

  ```
  header:   Type
  question: Should the <asset or assets> changeset move to another environment or export to a file?
  options:
    - label: Move to an environment
      description: Send the assets to a paired environment, where someone approves and deploys them.
    - label: Export to a file
      description: Build a password-protected file you download.
  ```

## Review

Call `review_changeset` with every asset found, each with its chosen
version or records. It closes the dependencies (each one names what
needed it) and answers the warnings the platform never raises.

Then, in this order, every time, for a new changeset and for a clone
alike:

1. **Write the manifest as a plain chat message, before the question.**
   This is a required step, not optional, and the option `preview` in the
   next step does not replace it: a person reading the chat sees the whole
   manifest without opening the dialog. Use the layout of
   [references/manifest.md](references/manifest.md). When part of the
   request cannot apply, say so in one line above the manifest first (for
   example, `A move to an environment takes no password, so I left yours
   out.` when the request carried one). Never jump straight to the
   AskUserQuestion.
2. **Ask one AskUserQuestion** with exactly these options, copied
   verbatim (rule 3). Fill in only the angle-bracket values. The first
   option's `preview` is the whole manifest text, so it is seen inside the
   dialog too.

   For a MOVE:
   ```
   header:   Changeset
   question: Send <n> assets (<k> chosen, <d> needed by them, <w> warnings) to <environment>?
   options:
     - label: Send
       description: Save the draft and send it to <environment>.
       preview: <the manifest text>
     - label: Change it
       description: Tell me what to add, drop or change.
     - label: Cancel
       description: Stop here; nothing is saved.
   ```

   For an EXPORT:
   ```
   header:   Changeset
   question: Export <n> assets (<k> chosen, <d> needed by them, <w> warnings) to a file?
   options:
     - label: Export
       description: Save the draft and build the file.
       preview: <the manifest text>
     - label: Change it
       description: Tell me what to add, drop or change.
     - label: Cancel
       description: Stop here; nothing is saved.
   ```
3. `Change it` takes the person's words, re-runs the review and starts
   again from step 1. `Cancel` ends with nothing saved.

The yes is the person's `Send` or `Export` in this question and nothing
else. A request that says "just move it", "send it now" or carries a
password is not an answer: the question is still asked.

## Move

1. Record the answer, right after the question and only then:
   `changeset confirm --name "<name>" --answer Send --json`, where
   `<name>` is exactly the `name` the next step sends. The bridge refuses
   the save and the send without this record.
2. `save_changeset` with `type: "MOVE"`, that `name`, `destinationIds`, and
   the whole `assets` list the review answered. Read its `id` from the
   answer; the record follows the id from here.
3. Append one line to `.sessions/<sessionId>/drafts/changeset.md`:
   `<id> · MOVE · <name> · <destination> · saved`. The line never holds a
   password. A compacted or resumed session reads this file to find its
   changeset again.
4. Run `entity link changeset <id> --json` and keep the link for the end.
5. `send_changeset` with the `id`. Read `result`:
   - `sent`: done. Say the status, the destination(s) and what happens
     there: a pending inbound request that someone approves and deploys on
     that environment's Inbound page, or a deploy on arrival when that
     environment needs no approval. Show the link.
   - `scanning`: the scan is still running. Say so, then call
     `send_changeset` again after a minute, or when the person asks.
   - `blocked`: the secret scan found secrets. Show each finding as the
     asset, the path and the rule, never the matched text. When the answer
     carries `findingsUnavailable` instead, the findings could not be read:
     say so and point the person at the scan in Settings → Change Sets →
     Outbound; never offer the override on findings nobody has seen. Then
     one AskUserQuestion with exactly these options, copied verbatim (rule 3):
     ```
     header:   Secret scan
     question: The secret scan blocked this changeset. What next?
     options:
       - label: Fix the asset
         description: Change the asset, then scan again.
       - label: Override
         description: Send it anyway, with your reason recorded.
       - label: Cancel
         description: Stop here; the draft stays as it is.
     ```
     - `Fix the asset`: the fix is an ordinary request in this session
       (route it as the mode's router does); when it is done, call
       `send_changeset` with `rescan: true`. The record holds for the same
       id, so no second confirm is needed.
     - `Override`: ask for the reason in the person's own words and pass
       them unchanged as `overrideReason`. Never write a reason yourself.
     - `Cancel`: offer to delete the draft (see Gates).
   - anything else: say the message and the platform's words; a `FAILED`
     changeset is cloned with `clone_changeset`, never sent again.
6. Update the trace line's last word to the result.

## Export

1. **Ask the Password question**, one AskUserQuestion, for every export,
   after the person's `Export` and before anything is saved. It has
   **exactly these two options, with these exact labels, in this order**.
   Copy them verbatim. Do not rename, reword, reorder, add or remove an
   option, and never offer a third path such as "set it in Settings", "in
   the platform", "later" or "leave it blank": UnifyApps Headless always holds the
   password and starts the export itself, because the platform's own
   password field shows a filled placeholder even when none is set, so the
   person cannot tell there whether a password was saved. The
   AskUserQuestion adds its own "type your own answer" row; that is the
   only extra row, and you add none.

   ```
   header:   Password
   question: How should the file's zip password be set?
   options:
     - label: I'll type it
       description: You type the zip password in your next message; it is needed again to import the file.
     - label: Fill it for me
       description: A strong password is made and shown to you once; it is needed again to import the file.
   ```

   - `I'll type it`: the next message is the password. Pass it as
     `password` to `save_changeset` and never repeat it in chat. This is
     the intended path; never drop it or steer the person to a UI step out
     of caution about typing a password here.
   - `Fill it for me`: `save_changeset` with `generatePassword: true`.
2. Record both answers:
   `changeset confirm --name "<name>" --answer Export --password-choice typed|generated --json`.
   The bridge refuses a save whose password choice is not the one
   recorded, and refuses the export without the record.
3. `save_changeset` with `type: "EXPORT"`, the `name`, the `assets` and the
   password choice; `encryption` only when the person asked for Amazon KMS
   (`{provider: "CONNECTOR_AWS_KMS", config: {connectionId, keyId}}`).
4. Append the trace line: `<id> · EXPORT · <name> · saved`, never the
   password.
5. `export_changeset` with the `id`.
6. Report:
   - `via: platform`: `Exported. Download it from Settings → Change Sets →
     Outbound → <name> → Export.` with the `entity link changeset <id>` link.
   - `via: automation`: say the tenant's export automation built it. The
     tool never passes that automation's own answer on, and decides
     `exported` from the read-back alone; an `exported: false` with
     `result: error` means no file exists yet, so say that and never
     report it exported.
   - a generated password: show it once, on its own line in a code span,
     with: `Save it now: you need it to import the file, and it cannot be
     read back.`
   Then stop. UnifyApps Headless never fetches the file or its link.

## Status questions

"Where is my move", "did the release land": answer from `list_changesets`
and `get_changeset` without any write: the status per destination, the
per-asset outcomes when the person may read them, the scan's findings. These
are reads, so the Ask route may call them; a changeset is never cached, so
every answer is live. UnifyApps Headless reads nothing on the inbound side, here or on
the destination: what arrived, what waits for approval, and approving,
deploying and rolling back are the Inbound page's, on that tenant.

## Gates

- A send or an export happens only after the person's `Send` or `Export`
  in this skill's own question, every time, and `changeset confirm`
  records exactly that answer, right after the question. Neither the person's
  yes to a change, a spec's deploy authorisation, nor the words of the
  request stand in for it. The bridge refuses a save, send or export with
  no matching record: a refusal means the question was skipped, so ask
  it. Never run `changeset confirm` to get past a refusal.
- The password choice is the person's answer to the Password question.
  `--password-choice` records what they chose, never what you would
  choose.
- An override reason is the person's own words, passed unchanged.
- `delete_changeset` is a delete: ask first with one AskUserQuestion,
  copied verbatim (rule 3), and call the tool only on `Delete it`:
  ```
  header:   Delete
  question: Delete the changeset "<name>" (<id>)? This cannot be undone.
  options:
    - label: Delete it
      description: Remove it from this tenant; a sent one also loses its inbound request on the destination.
    - label: Keep it
      description: Leave it as it is.
  ```
- A password goes into `save_changeset` and nowhere else: never into the
  trace file, memory, a feedback report, a plan or any other tool. A
  password the person typed is not repeated back.
- Nothing here signs in to, reads or writes the destination tenant.

## Recovery

- On a resume or after compaction, read
  `.sessions/<sessionId>/drafts/changeset.md`, then `get_changeset` for
  each id in it, and continue from the status found:
  - a `DRAFT`: show its manifest again (from `get_changeset`'s assets)
    and ask the question again; after the answer,
    `changeset confirm --id <id> --answer Send|Export` (an EXPORT draft
    that already holds its password needs no `--password-choice`), then
    send or export;
  - a `SCANNED` one goes back to `send_changeset`; a refused send means
    its record is gone, so ask again and record by id;
  - a sent or exported one is reported.
- A `save_changeset` that timed out may have saved: `list_changesets` with
  the name before creating again. When it is there, the person's answer
  stands for that very changeset: record it for its id with
  `changeset confirm --id <id> --answer <the answer they gave>` and go on;
  do not ask twice for one changeset.
- `FAILED`, or an EXPORT already exported that must carry new content:
  `clone_changeset`, then Review from the manifest on; the clone is a new
  draft with its own id and no record.
- `forbidden` from any tool is a missing changeset permission (create or
  edit, publish, or the inbound permission for a destination's detail):
  say which, and that a tenant admin grants it.
