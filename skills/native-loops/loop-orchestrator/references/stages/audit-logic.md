# Check: logic

Is the page built right: does every interaction do what it says once, is any
config dead or doubled, and do the block choices, bindings and navigation hold?
Runs as [audit checks](../audit-checks.md) § The check agent says. Issues:
`LG<g>-<nn>`, `check: logic`, `kind: logic`, `interaction` or
`navigation`. The block is [native-logic-review](../../../native-logic-review/SKILL.md);
in a loops run its findings become issues and the fix waits for
`/ua:native-fix-loop`, never for this check.

## Config (the check agent, from the cache)

1. **Pin the version.** `ua cache page <pageId> --app-id <appId> --json`;
   every issue names it. A version that moves during the check means someone
   edited the page: the check starts that page again once.
2. **Prune.** `node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-logic-review/scripts/prune.mjs" <pageId> --app-id <appId> --json`:
   rules R1–R8 of the [prune rules](../../../native-logic-review/references/prune.md)
   (unused and doubled sources, uncalled functions, blocks hidden by a literal
   `false`, empty containers, doubled actions, a source run twice on load, a
   tappable with no event). Check each finding by hand as that table says before it
   becomes an issue.
3. **House rules on logic.** `page-lint.mjs --app-wide`: H8 (no session
   storage on mobile), H10 (constants, one validator, one plain chain per
   button), H11 (names unique app-wide), H15 (public pages and global
   variables), H16 (return a result with `navigateBack` and an `onPageFocus`
   reader), H17 (an `onPageBack` chain still lets the person leave).
4. **Config review.** UnifyApps Headless's checklist
   [config-review](../../../../app-verify/references/config-review.md), all of it
   and its mobile part: page tree and routing, navigation, page sockets, blocks
   and their sheets, styles that throw or erase themselves, bindings, states.
   Use it as written; an issue cites its section.
5. **The critical checks** of `native-logic-review`'s
   [checks](../../../native-logic-review/references/checks.md): logic, redundant JS,
   interactions that do nothing or run twice. Write down what the page is for
   first (who opens it, what it shows, what a person does on it); every issue is
   judged against that.
6. **State.** `ua cache keys <pageId> --app-id <appId>` and
   `ua cache grep <variable> --app-id <appId>` for each value the page
   passes on or reads back: a variable two pages name differently, a page
   input the opener never passes, a value the flow needs after a reload kept
   only in a page variable. Cause `state`, owner the page.
7. **A chat page's AI agent.** When the page chats with an AI agent:
   `ua cache agent <agentId>`. What the page offers (its starters, its
   cards, its words) against the agent's instructions and tools: a promise
   with no tool behind it, a tool that calls an automation the page never
   offers. Cause `agent`, owner `agent:<id>`; a tool's automation that fails
   is the automation's.

## Device (queued, never waited for)

A statement the config cannot prove (two calls on open, a tap that runs a chain
twice, a back that loses the result) goes into one `retest` request per page
whose issue log lists those statements with the steps to see them:

```
loops queue add --run <R> --kind retest --page <pageId> --page-name "<Page>" --version draft \
  --app <appId> --issues R/issues/logic-<group>-device.md
```

The test runner reproduces each statement with taps that only navigate or open sheets,
reads `native-network-logs` for doubled calls, and marks each issue `verified`
(the statement did not hold: the issue is dropped) or `still open` (proven).

## On a WEB app

The config half (§ Config) is the same, judged from the cache. The device
half runs in a test runner's browser on the preview route, queued with
`--platform web` and the widths, path, group and first issue number in the
note ([audit checks](../audit-checks.md) § The checks), and splits by what a
statement needs:

- **Reads only.** A statement the runner can see by navigating, opening a
  sheet or reading the page's calls (two calls on open, from `B calls`) is a
  `retest` request as above, with `--platform web`.
- **Typing or a submit.** A statement that needs a field filled or a save
  pressed (a submit that runs its chain twice, a save the list never shows)
  runs only as an `acceptance` request, on seeded `ZZ_LOOP_` test records,
  and only when the run settings allowed the checks to save. Its steps file
  is `R/accept/logic-<group>/<n>/steps.md` in the
  [feature stage](feature.md) § 7 format: `Writes:` names what it saves and
  says "allowed in the run settings", typed values start with `ZZ_LOOP_`,
  and `Expect:` and `Effects:` state what holds when the statement is false
  (one call, the saved row listed). A passed check drops the issue; a failed
  one proves it (`still open`).

  ```
  loops queue add --run <R> --kind acceptance --platform web --steps R/accept/logic-<group>/<n>/steps.md \
    --page <pageId> --page-name "<Page>" --version draft --app <appId> --note "widths 1440; path <preview path>"
  ```

  When the run settings allow no saves, the issue stays
  `not retested (needs typing or a submit; the run settings allow no saves)`.
  It never goes into a read-only `retest`, which does not type.

## Done when

Every page has issues, `ok`, or `Not reached`; every prune finding was checked by
hand; every device statement is queued, or on WEB marked `not retested` with
its reason.
