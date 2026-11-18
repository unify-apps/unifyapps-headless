# Recipe: third-party analytics tag

## Contents

- When
- Questions for the person
- Entities
- Security
- Performance
- Acceptance checks
- Limits

Puts a vendor's analytics script on an app's pages, from the snippet the
person pastes.

Platform: WEB only (a MOBILE app needs a platform change).

## When

"Add a tracking tag", "add the vendor's analytics script", "add a pixel",
"put our tag manager on the app". On a MOBILE app, say at once that it needs
a platform change (§ Limits) and offer the [usage tracking](usage-tracking.md)
recipe instead.

## Questions for the person

1. **The snippet.** Default: none; the person pastes the vendor's snippet
   with its tag id. Nothing is built without it.
2. **Which pages.** Default: every page (the app header). Option: the pages I
   name (each page's header).
3. **Who the user is.** Default: nothing about the user is sent. Option: an
   id only, never a name or an email.

## Entities

| # | Kind | What | Builder | Knowledge it loads |
| --- | --- | --- | --- | --- |
| 1 | app (question 2: every page) | The snippet as a top-level `<script>` in the app's header code, written with `update_app_settings` panel `customCode`: read what is stored first, keep it, add the snippet, and send header and footer together | `ua:app-agent` | `ua:app-craft` (`references/custom-css-and-code.md` § App header, footer and HTML attributes), `ua:app-design`; the sheet `concepts/interface-record/custom-code` |
| 2 | page bind (question 2: some pages) | The snippet in each page's `customCode.header`, through the `update_page_settings` step of `apply_page_edits`, after reading it with `get_page_outlines {view: "settings"}` | `ua:app-agent` | as row 1; the sheet `concepts/pages/custom-code` |

## Security

- **The person's words only.** The vendor's script runs in every page it is
  on, with what the signed-in person sees. It goes on only when the person
  asked, with the snippet they gave.
- **A tag id is not a secret.** The browser of every visitor loads it. A
  vendor's API secret is, and never goes into page or app code.
- **No data in code.** Only a top-level `<script>` runs, and a `{{ }}` there
  can read the signed-in user's fields. Question 3 decides what is sent;
  never a record value, and never a `{{ }}` inside a string that becomes
  HTML or code (`ua:ua-secure-by-default`: outside text stays text).
- **Narrow targets.** A header `<style>` or script reaches the whole
  document, the builder included. The snippet names nothing of the page.

## Performance

- **The page never waits on the vendor.** The page `header` goes in before
  the page paints, so the snippet loads its script with `async`, or goes in
  the footer, which runs last.
- **Once.** A page script can run twice: the snippet is guarded so it loads
  the vendor once, and it removes its timers and listeners on the
  `__CLEANUP__` window event.

## Acceptance checks

1. **`acceptance`: the tag loads once.**

   ```
   1. Open <Page> (<route>)
   2. Expect: `eval "() => document.querySelectorAll('script[src*=\"<vendor host>\"]').length"` answers 1
   ```

   The page is read, not tapped: the script is not in the snapshot, so the
   count comes from `eval`. One check per page of question 2, or one page
   when it is every page.

## Limits

- **MOBILE: not possible in the app.** A MOBILE app never injects page or app
  code, and its `htmlAttributes` do nothing (`custom-css-and-code.md`
  § Mobile apps). A tag on MOBILE needs a platform change: the loop writes a
  handoff note for the platform team and never pretends it is done.
- **Not checked: the vendor's side.** Whether the vendor received the hit is
  seen in the vendor's own live view; the person checks it (a manual step).
- **No tap events from page code.** A page script cannot read blocks, page
  variables or data sources, so it cannot send one event per tap. Tap
  events are the usage tracking recipe's.
- **Unknown:** whether the builder preview route runs app header code. The
  first check says so; when it does not, the tag is proven on the published
  app after a publish the person chose.
- **Unknown:** how a script tells the builder from the app. The app header
  also loads in the builder, so editing sessions may send hits too.
