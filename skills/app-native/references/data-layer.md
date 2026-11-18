# The no-code data layer

Read this when a page has field validation, a derived value, a constant, or
a rule used in more than one block or action — and when reviewing a page
whose blocks or actions hold a regex, a `.length` check or a message string,
each of which is a rule written in the wrong place. A page's business logic is
written once and reused, the way a React app keeps rules in `utils`: a
pattern, a limit, a message or a rule lives in exactly one place on the page,
and blocks and actions only read the result. Copy a rule into a caption, a
border colour and a button condition instead, and the next change fixes one
copy while the page quietly disagrees with itself. These rules apply on web
too, not only on MOBILE apps, except rule 6, which is MOBILE's. A MOBILE
build is where this goes wrong most, because an inline binding in a
Repeatable row re-runs per row as well as per render.

## The rules

1. Constants are page variables with plain literal initial values (patterns,
   messages, limits, defaults), in a page folder named `constants`. On a
   PUBLIC page they stay on that page — a public page cannot read app-level
   variables or functions, so a constant on the global page reads as nothing
   there. Only on pages a signed-in person reaches may shared constants live
   on the global page.
2. One validator per page: a manual page function (`runBehaviour: 'manual'`,
   folder `validation`) that reads the constants and the field variables and
   returns `{ <field>: { valid, error }, canContinue }`. `error` is the
   message only when the field is touched and invalid, otherwise `""` — one
   place to change a rule, and the error stays empty until the person has
   touched the field.
3. Run it with a `triggerFunction` action after each field's `onChange`
   write and `onBlur` touched write, and once on `onPageLoad` — a page
   function takes no arguments, so it has to run again after the state it
   reads changes.
4. Blocks only read results: a caption binds
   `{{ func_<id>['value']['email']['error'] }}`; borders and a button's
   `appearance.disabled` read the same object through condition objects. No
   regex or rule in any block or action — reading one result keeps every
   block in agreement.
5. One plain action chain per button. When behaviour differs by mode, render
   a button per mode (each with its own `visibility`) instead of
   `runCondition`s inside one chain — a chain with conditions per step is
   hard to read, and one wrong condition runs the wrong steps with no error.
6. On a MOBILE app, list adaptation (filter, sort, shape) also lives in a
   manual function, run by a `triggerFunction` action from the source's
   `onSuccess`, the relevant `onChange` or page load (`app-native` SKILL.md
   iron rule 14); the block binds the plain reference
   `{{ func_<id>['value'] }}`. An inline expression re-runs on every change
   it reads, once per block and, inside a Repeatable template, once per row.
   On a WEB app the same value is an automatic function whose body reads the
   source (`app-page-build` § The bind task, step 5).
7. Folders are one level only — never put a folder inside a folder; the
   builder has no way to create, paste or drag one into another.
8. Write function bodies readable: one statement per line, two-space
   indent. Inline scripts (`executeScript`, logic inside a binding) are a
   last resort, only when no block, action or page function can do it —
   `apply_page_edits` and `update_event_actions` warn on every `executeScript`
   they store.

Two condition tips that are easy to get wrong: disable a button with
`canContinue` `NOT_EQUAL "true"` (it stays disabled before the validator's
first run), and show a caption with `MIN_LENGTH "1"` on the error (false for
`""` and for nothing).

## Knowledge sheets, by route

Read with `get_app_builder_knowledge`.

| Route | For |
| --- | --- |
| `concepts/functions` | manual vs automatic, body format, the list-shaping recipe |
| `concepts/bindings` | read forms, and why a block binding stays a plain reference |
| `concepts/folders` | the one-level folder map |
| `concepts/global-page` | app variables and functions, and why a public page cannot read them |
| `concepts/pages/page-variables` | declaring constants and field variables, `initialValue` conversion |
| `ai-editing/condition-objects` | the condition shape for `visibility` and `appearance.disabled` |
| `actions/trigger-function` | running the validator |

## Worked example

A sign-in Entry step on a customer app: `constants` holds
`EMAIL_PATTERN`, `PHONE_PATTERN`, `MSG_INVALID_EMAIL`, `MSG_INVALID_PHONE`,
`DEFAULT_DIAL_CODE`; `validation` holds `validateEntry`. Each field writes
its variable and re-runs `validateEntry` on change, and sets its touched
flag and re-runs it on blur. Captions read `error`. Two Continue buttons, one
per mode (email, phone), each visible in its own mode, both disabled by the
same `canContinue`, each with one plain chain.

On a MOBILE app, also read `skills/app-native/SKILL.md` — the layout,
binding, navigation and press-feedback rules this data layer feeds into.
