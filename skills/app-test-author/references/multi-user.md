# Multi-user tests — `user` on a step

Loaded the moment a scenario involves more than one person: one sends and another receives, one requests and another approves, work one assigns shows up in another's queue, or two roles see one record differently. A scenario one person can carry never loads it, and its steps carry no `user`.

## The test's users

- A test runs as an ordered list of test users, sent to `Deliver Steps` as `userIds`. The **first is the default**. Every id is one of the app's test users (`testUser: true`), and no id appears twice.
- Send the test's **whole list, in order, on every delivery**. Publishing saves exactly the list sent as the case's users, so a shorter list removes users from the case.
- Map each role the scenario names to one user before drafting, and record the mapping in `observations` ("Requester: first user. Approver: second user.").
- A scenario that needs a person the list does not have is an `AskUserQuestion`: that test user has to be added to the test first. Never invent an id, let one user play two roles, or drop the second person's steps.
- When another user's browser contradicts the scenario, the _Scenario–observation conflict protocol_ question also offers **a different test user for that role**: the user may lack the rights the role needs, which no change to the steps can fix.
- Every user belongs to the test. What one does to another stays inside records the test created, like every other step (_Safety_).

## `user` on a step

- `user: "<id>"` runs the step as that user. A step without `user` runs as the first, so leave it off the first user's steps. The id must be one of `userIds`; any other is a compile error.
- **No inheritance.** A step inside `then`, `else` or `children` does not take its container's `user`: every nested step another user performs carries its own.
- On `if` and `while`, `user` picks whose screen the condition is checked on. `for_each`, `break` and `continue` read no screen and carry no `user`.
- A step that reads the page reads its own user's screen: a `store` from the page, an `execute_js` or `execute_js_verify`, and every assertion carry the `user` whose screen they read. A `store` of a literal reads nothing.
- Each user has their own clipboard: clipboard steps, a `store` from it and clipboard asserts carry the `user` whose clipboard they use; another user gets a copied value only through a `store`d `<<var>>`.
- Each user has downloads of their own: a step marked `downloads: true` (or a `wait_for_download` and the acting step before it), and the `download_*` checks and `store` `from: "download_text"` that read its file, run as the same user; one user's check never reads another user's download, and another user's download inside an `if` or loop never makes this user's file uncertain. A check left without `user` runs as the first user and reads the first user's file, which compiles whenever the first user also downloaded — so a later user's check MUST carry their `user`.

## Browsers, tabs and state

- Each user has a signed-in browser of their own. The first user's starts the way any test does. **Every other user's opens on a blank page**, so that user's first step is their own opening `navigate` (with `user`), then the readiness pair.
- The readiness pair after a navigation, `reload` or `navigatesTo` click carries the same `user` as the step that navigated. Without it, the settle waits on the FIRST user's page while the navigating user's page is still loading.
- Each step acts on its own user's current tab. A window or tab action (`windows-tabs.md`) switches only its own user's tab; the other users stay where they were.
- **Variables are shared.** A value one user `store`s is read as `<<var>>` by any later step, whoever performs it. That is how the second user asserts on the record the first created: `store` the `<<random:N>>` identity once, the first user fills it, the second user asserts through the same `<<var>>`.
- Elements belong to the app, not to a user: the same element object serves every user who acts on it.
- `go_offline` and `go_online` act on their own user's browser only: a `go_offline` with `user` takes that user offline while the others stay connected.

## Seeing another user's change

One user's action reaches another user's screen only as the app delivers it. Watch which way it arrives during the walk, with both browsers open:

| the change reaches the second user's screen | the steps |
|---|---|
| live (pushed or polled) | the second user's assertion; its retry absorbs the delay |
| only after a refresh | the second user's `reload` and readiness pair, then the assertion, all with `user` |
| after a delay the walk could not pin down | a `while` with the second user's `user`, a condition on the element that proves arrival, a `reload` and readiness pair inside (each with `user`), and a `maxIterations` cap (`control-flow.md`) |

Never a fixed `wait` to give it time, except as `network-rules.md`, _Waiting on the app's own timer_, allows.

## Walking it

Walk it the way the steps will run: each role signed in, in its own browser, switching browsers exactly where the steps switch users. A step for one user is authored only from what that user's browser showed, never from another user's screen.
