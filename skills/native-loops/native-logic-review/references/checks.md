# Critical checks

These are only the checks that UnifyApps Headless's config-review (`${CLAUDE_PLUGIN_ROOT}/skills/app-verify/references/config-review.md`), UnifyApps Headless's page reviewer (its 7 qualities: hierarchy, grouping, alignment, contrast, readability, consistency, states), the house-rules lint and `prune.mjs` do not already cover. Run those first; this list is what is left.

Be critical. "It works" is not a verdict. A finding needs a place (block, event, source or function, by name and id), what you saw, and why it matters to a person using the page.

## 1. Logic

| Look for | Read |
| --- | --- |
| A condition that is always true or always false (`{{ x }} == x`, a check on a value that can never be empty) | `cache events` (`conditional` actions), `cache blocks --field visibility` |
| A chain in the wrong order: navigate before the save returns, a refetch before the write, a success toast before the result | `cache events --name <block>` |
| Two places that compute the same value and can drift apart (a function and a binding, two functions) | `cache keys --name <function>` bodies, block bindings |
| A page input the page needs but no caller sends | `entity context page` (`inputSchema`), the events of the pages that open it |

## 2. Redundant JS

- JS in a binding that the block can already do by itself: a ternary for a colour a state style sets, a `.map` to rename a field the source can return.
- A page function that only returns one value with no logic: bind the value.
- A variable that copies a source's data and is never changed: bind the source.
- `customCSS` that repeats what `appearance.styles` already sets, or sets a value back to its default.

## 3. Interactions

For every tappable block and every event:

- Does the tap do what its label says? A "Save" that only navigates is a finding.
- Can a quick double tap run the write twice? UnifyApps Headless's rule (loading disables the button) says it should not; prove it on the device.
- What can be pruned: an action that sets a variable nothing reads, a refetch of a source nothing on screen shows, a navigation the next page undoes.

Every interaction that changes data or navigates goes on the device list for [verify](verify.md).
