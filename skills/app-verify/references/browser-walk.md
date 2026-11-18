# The browser and the device — for a `[visual]` task only

## Contents
- When this runs
- Your browser
- The builder page screenshot
- The two shots, for a page with a job
- The walk on the preview route
- The device, for a MOBILE app
- Waits
- What the report adds

## When this runs

Only when the accepted spec's Proof row marks the task `[visual]`, the task's
message has a `Job:` line (its Proof says `[visual: shots at two widths, see Rules]`),
or a `Still off` item from an earlier dispatch names a visual check.
Otherwise the report says `visual: not requested`.

A builder-canvas screenshot is not evidence for a MOBILE app. The canvas shows
the web version. A native verdict needs the app on a device, and the UnifyApps
Preview app runs the saved draft there, so the change needs no publish once
the app has been published once: the
`app-native` skill's device loop wins over this file for the screen. The walk
below still applies to what the page calls.

## Your browser

You drive a browser of your own: Playwright's Chrome for Testing, with its own
profile, cookies and storage. It is a separate app from the person's Chrome,
so the links they click in other apps never open in it. The first browser on a
machine downloads it once, about 100 MB in under a minute. Builders working side by side never share one, so a
window size or a preview device you set stays yours, and nobody moves your
page. You never need to ask anyone to open it.

Every call is one script, with your browser folder first. Your browser folder
is `browser/` inside the work folder your message names. Below, `<browser>`
stands for it:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-node.sh" "${CLAUDE_PLUGIN_ROOT}/skills/app-verify/scripts/browser.mjs" <browser> <command> [args]
```

**Start with `open-page <url>`**, and use it again for every next page. It
opens a builder or preview page signed in as the person, with the sign-in
UnifyApps Headless saved. It loads the URL fresh, waits up to 20 s until the page draws its
blocks, and checks that it landed on the page you asked for. It prints
`{ok, url, loadedAt, pageIds, blocks}`. From the first `open-page` on, the
browser records every data-source call the page makes.

**Then use playwright-cli's own commands** on the page:

| To | Command |
|---|---|
| see the page's controls, each with a ref such as `e12` | `snapshot` |
| find the nodes that hold a text | `find "<text>"` |
| click, double-click or hover a control | `click e12`, `dblclick e12`, `hover e12` |
| type into a field, or set a select | `fill e12 "<text>"`, `type "<text>"`, `select e12 "<value>"` |
| press a key | `press Escape`, `press Enter`, `press ArrowDown` |
| tick a checkbox or a radio | `check e12`, `uncheck e12` |
| attach a file to a file input | click the upload control, then `upload ./file.pdf` |
| set the window size | `resize 1440 900` |
| scroll, down or sideways, where the mouse is | `hover e12`, then `mousewheel 0 600` or `mousewheel 600 0` |
| read what the page holds: text, attributes, size, computed style, parents | `eval "el => getComputedStyle(el).fontFamily" e12`, `eval "() => document.fonts.size"` |
| take a screenshot | `screenshot --filename=<name>.png`, or `screenshot e12` for one element |
| read what the page threw or logged as an error | `console error` |
| go back or reload | `go-back`, `reload` |

**The script adds three commands of its own:**

| Command | What it does |
|---|---|
| `calls` | The data-source calls the page made since `open-page`: `[{name, url, method, status, post, resp, at}]`, with `post` and `resp` cut to 2000 and 800 characters. A reply is kept even when the page moved on to a new document. |
| `wait-for "<text>" [cap-ms]` | Waits until the text is on screen, up to `cap-ms` (default 10000). Exit 6 when it does not come. It matches the text as it shows, case included: a label styled in capitals is waited for in capitals. |
| `fit-page` | Makes the window as tall as the page, so the next screenshot holds what is below the fold. A UnifyApps page scrolls inside the page, not the window. A list that scrolls inside its own box keeps its scroll. |

`fit-page` and `page-shot` take the page the last `open-page` loaded. After an
`open-page` that failed they refuse, since the page still open is from before
that call: run `open-page` again first. `page-shot` loads that page fresh
before each shot, so it shows a write made since. `fit-page` keeps the page as
it is: after a page write, run `open-page` again before `fit-page`.

**A task that tests a camera or microphone block** (CopilotVoice,
CopilotVideo, a camera or dictation block): open the page with
`open-page "<url>" --fake-media`. Without it the browser refuses the block
with `NotAllowedError`.

**Close it before your report:** `close`. That also deletes the private folder
that holds the person's sign-in. A browser left open is closed and deleted
after 12 hours.

The commands that would print or save the person's sign-in are refused:
`run-code`, `state-save`, `cookie-list`, `cookie-get`, the storage `-list` and
`-get` commands, `request`, `request-headers`, `response-headers` and tracing.
Read the page with `snapshot`, `eval` or `calls` instead. The refusal, and
`open-page`'s https-only check, are per browser folder, not global: a second
browser folder that never ran `open-page` holds no sign-in, so `run-code` and
a non-https `open` work there. Use a second folder only for work that needs
one of those and does not need the person's tenant sign-in — never to read
tenant content around the guard.

What each `open-page` exit means for the report:

- **Exit 3 or 4**: there is nothing to look at. Mark the visual proof
  `UNVERIFIED` with the script's line, and carry on with the read-backs.
- **Exit 5 on the tenant's sign-in page**: the sign-in UnifyApps Headless saved has run
  out. Report `needs_confirmation` with the script's line as the question, and
  offer two answers: `signed in` (`open-page` runs again) or `skip` (the task
  reports `ok` with the visual proof `UNVERIFIED`). A task that fixes a
  behaviour is the one exception: it is `ok` only when you saw the cause gone,
  so on `skip` it stays `needs_confirmation`, naming the check still to make.
  Never run a login command yourself.
- **Exit 5 on a published app's sign-in page**: the URL is the app's live
  address. Asking the person to sign in does not help. Open the preview route
  instead (below).
- **Exit 5 on another app**: the URL is wrong. Fix it as the line says and run
  once more.
- **Exit 5 on another page of the same app**: the URL is wrong, or the page
  sent you there itself, with an onPageLoad that navigates to the app's own
  sign-in or a guard page. Check the path against `get_page_paths`. When it is
  right, the app moved you: do what that page asks in this browser
  (`snapshot`, `fill`, `click`), then `open-page` your URL again.
- **Exit 6**: the page drew no block in 20 s. Take a screenshot and read it
  once. Run `open-page` once more; the same result again is `UNVERIFIED` with
  the script's line.
- **Exit 7**: the tenant would not say which environment it runs. Stop, and
  put the script's line in the task's `error` word for word.

## The builder page screenshot

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-node.sh" "${CLAUDE_PLUGIN_ROOT}/skills/app-verify/scripts/browser.mjs" <browser> open-page "<builder URL>"
bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-node.sh" "${CLAUDE_PLUGIN_ROOT}/skills/app-verify/scripts/browser.mjs" <browser> screenshot --filename=<name>.png
```

The file lands in `<browser>/<name>.png`.

1. Build the page's builder URL from its id:
   `https://<host>/p/0/interfaces/<interfaceId>/builder/page/<pageId>`. The
   platform sends it on to the page's own path. The path works too:
   `…/builder/<slug>`, with the page's slug from `get_page_paths`
   (`…/builder/mfa-verification`). Never `…/builder/<pageId>`: a page id where
   the path goes opens the app's default page, and `open-page` stops with exit
   5 rather than show it. A module has no path: open it at
   `…/builder/module/<moduleId>`. A URL without `/builder/` lands on the app
   Overview, which shows no page. `create_app` returns no builder URL; its
   `url` is the published app.
2. Check the printed `url` and `pageIds`. The `url` must carry this task's
   `interfaceId`, the route and the page's path. `pageIds` must hold the page
   id; `open-page` stops with exit 5 when a page or module id it was given is
   not on the page it opened.
3. For a width the Proof names, `resize <width> <height>` before the
   screenshot. For the whole page height, `fit-page` before it.
4. Read the file to SEE the page. Judge it against the request: overlaps,
   cut-off text, wrong spacing, missing content, a block that rendered empty.
   Config that stored correctly can still look wrong. A shot of one colour
   shows nothing: it is not proof.

Overlays and hidden states do not show in a resting shot. Check them with
[visual-verification.md](visual-verification.md). At most 2 check-fix rounds.

## The two shots, for a page with a job

Config that saved correctly can still read wrong, and the person will see
the page, not its config. So a page with a job is looked at the way they will
look at it: whole, on the preview, at the platform's own laptop sizes. A
desktop page is laid out in a frame at least 1440 px wide, so a narrower
window only cuts its right edge off; the preview's "Switch variant" menu is
how the platform lays a page out at another device size. `page-shot` picks
that variant, and refuses a builder URL, because the builder draws its
canvas scaled. A shot at a width under 1440 (1070, 1280) can show that same
right-edge cut from the frame itself — report it as the frame's own
min-width clipping, not as an app defect.

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-node.sh" "${CLAUDE_PLUGIN_ROOT}/skills/app-verify/scripts/browser.mjs" <browser> open-page "<preview URL>"
bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-node.sh" "${CLAUDE_PLUGIN_ROOT}/skills/app-verify/scripts/browser.mjs" <browser> page-shot 1440
bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-node.sh" "${CLAUDE_PLUGIN_ROOT}/skills/app-verify/scripts/browser.mjs" <browser> page-shot 1366
```

Each sets the window to that device size (Laptop 1440 x 834, Laptop 1366 x
709), picks the matching variant, makes the window as tall as the page, saves
`<browser>/page-<width>.png` and prints `{file, width, height, cut,
variantMenu}`. The other sizes the platform offers, 1680, 1920 and 2560, work
the same way when the job says the page is used on a large screen. Only a WEB
app's preview has the "Switch variant" menu: on a MOBILE or DISPLAY app's
preview page-shot takes the window at that size, with the app's own frame in
it, and prints `variantMenu: false`; those are still the two shots to report.

A page whose data hangs on a page input (a `requestId`, a record id) shows
only its empty state without one. Give the input to the shot:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-node.sh" "${CLAUDE_PLUGIN_ROOT}/skills/app-verify/scripts/browser.mjs" <browser> page-shot 1440 --input requestId=r_123
```

Each `--input <name>=<value>` goes on the last `open-page` URL as a query
value. The preview reads a page input from the query value of its name, when
the page's input schema names it. page-shot loads the page fresh with them,
checks it landed as `open-page` does, shoots, and adds `inputs` to its JSON.
The next shot in that browser keeps them. Whether a module opened at
`…/preview/module/<id>` reads them is not known yet: if its shot still shows
no data, say so in `unverified`.

1. Read both files. For each region of your message's Design, write what you
   see of it in `seen`: where it sits, how much room it takes, whether all
   of it is on screen and readable, and whether it does what its line says.
2. Answer, from the shots: `firstSeen`, what the eye lands on first and
   which part of the job it serves; `signals`, how each value in the job's
   `signals` shows its state; `dataOrder`, whether the rows and numbers are
   complete and in the order the page says.
3. Fix what the shots show is wrong or unfinished, then take both shots
   again and look again. A problem you cannot fix goes in `unverified` as
   `design: <what> — <why it cannot be fixed>`.
4. Put the files page-shot printed, from your last round, in the report's
   `design.shots`. `plan report` checks that each is a PNG of its width, at
   two of the platform's sizes. The page's review task reads these same
   files: a second agent, `page-reviewer`, judges them against the job and
   the Design without your answers, and may send the page back with
   findings.

## The walk on the preview route

The preview route is the builder host's live view of the saved page:
`https://<host>/p/0/interfaces/<app>/preview/<path>`. Use the page's
address from `get_page_paths`, with real values in the params (the ids you read
off the object or the previous step), or `…/preview/page/<pageId>`, or
`…/preview/module/<moduleId>`; never the page id in place of the path. Data
sources run there, events fire, and the automation a button calls runs for
real. So walk seeded test data, never a record someone would miss.

A browser proof always opens the tenant's builder or preview route. The
published address (`liveUrl`, `pageUrls`) is on another host. It has its own
sign-in for the app's users, which your browser never holds. Only a PUBLIC
app's live address opens without one.

1. **Open each page of the flow in order.** `open-page "<preview URL>"` and a
   `screenshot` per page. An empty list or a "not found" state points at the
   params first. A page another page opens, with page inputs or params, is
   also reached the way a person reaches it: open the page before it and
   click the link. A value the link sets is missing on a direct load, and a
   value a direct load sets can be missing after the link, so one way alone
   passed a table that showed 0 rows when reached through the app.
2. **Drive the step that calls the automation.**
   ```bash
   B="${CLAUDE_PLUGIN_ROOT}/skills/app-verify/scripts/browser.mjs"
   node "$B" <browser> open-page "<preview URL>"
   node "$B" <browser> snapshot                        # refs: e14 the name field, e21 seat 14A, e30 Confirm
   node "$B" <browser> fill e14 "Walk One"
   node "$B" <browser> click e21
   node "$B" <browser> click e30
   node "$B" <browser> wait-for "Booking confirmed" 10000
   node "$B" <browser> screenshot --filename=seats-after-confirm.png
   node "$B" <browser> calls
   ```
   Take refs from the latest `snapshot`: a ref from before the page changed
   may point at nothing. Copy each ref whole. On the preview the page sits in
   a frame, so its refs carry a frame part in front (`f1e172`, not `e172`):
   a ref built from a pattern such as `e<number>` picks the wrong control or
   none, and `fill` then types into nothing with no error. A click that opens a list or a menu shows its items
   in the next `snapshot`. To pick a SingleSelect value, click its box, then
   the option. To open a Table row and close what it opened, click the row,
   then `press Escape`. A click on a `navigate` action with a path such as
   `/home` leaves the preview route and lands on the tenant root, a 404: that
   is the page's fault, not the walk's. Report it, since a link to a page of
   this app is `navigateToPage` (`app-design`'s `references/navigation.md`).

   `calls` lists the page's `POST …/workflow/execute/node?name=<source>`
   requests with their status and the start of the request and the reply.
   They are under `/api/`, or under `/api-endpoint/external/` on a public
   app's live address. The reply carries `executionInstanceId` and the
   automation's own `status` and `message`. `console error` lists what the
   page threw or logged as an error; an action that did nothing usually left
   its reason there. A step that fails is a finding, not a retry.
3. **Read the effect of the call.** `calls` must show the expected request,
   HTTP success, and the reply's own `status` / `message`. Then read the
   record the automation wrote, through the object read. That, not the 200,
   proves the flow works. If the reply is cut short or the effect cannot be
   read, report `UNVERIFIED`.
4. **Say what the walk could not reach.** Exit 3, 4 or 5: follow the list
   under § Your browser, and the report says which step was not walked.
5. **Close the browser:** `close`.

The walk is one pass. Fix what it finds through the normal writes, inside the
2-round cap. What is still off after the cap goes under `Still off` in the
report, with the one fix or check.

## The device, for a MOBILE app

Device proof runs on the draft. The UnifyApps Preview app opens the app's saved
draft, so the change needs no `publish_app` once the app has been published
once (`app-native` § Verify a native write on a device), and it runs only when
the task's Proof asks for it. A page task never
publishes. A mobile page with no `[visual]` proof is proved by its read-backs,
and the report says `device: not requested`.

The preview route draws a MOBILE app with the web blocks. There a style
becomes CSS, so a native-only key such as `paddingHorizontal` shows nothing.
On the preview, a MOBILE app proves its data calls only. Its native look and
native-only keys are proved on a device or by read-back.

## Waits

Every wait is a read with a cap. `sleep` is refused.

| Waiting for | The read | Ready reads as | Cap |
|---|---|---|---|
| a publish | the `publish_app` reply, which reads the deployment back and gives each page's live address in `pageUrls`, or `list_interface_versions {kind: "published"}`; `get_app_overview` returns no deploy state. Quote the live addresses; a browser proof of a published page still opens its preview route | the new published version with its note (a 200 is not proof) | one re-read |
| the app on a device | the installed device driver; otherwise the manual checklist | the app open on the intended screen in the version you check: Draft in the UnifyApps Preview app before a publish, Published after it | the driver's own wait |
| a splash to settle | the device driver's screen-idle wait, when a driver is installed | `settled: true`, then ONE `describe` | 10 s, then judge what is there |
| the page to draw | `open-page` | `ok: true` with `blocks` above 0; it waits for the page's blocks itself | 20 s, then exit 6 |
| text on the walked page | `wait-for "<text>" <ms>` | `"<text>" on screen after … ms` | the cap you give, default 10 s, then exit 6 |
| a direct automation test | the automation task's own `trigger_workflow_run` (not the app agent's: it has no automation tools) | the run's final status and the checked effect | the tool's one-minute wait; unfinished → `UNVERIFIED` |

## What the report adds

When the browser or device ran: the screenshot paths with the route and params
they were taken under, and each page's `loadedAt`; the walk's steps; each
`calls` entry's `name`, `status` and the reply's `status` / `message`; the
`executionInstanceId`; any `console error` lines; the device target and the
screen outcome.

A screenshot is proof only when it was taken after the task's last write. A
shot from before that write shows the old page: leave it out of the report.
