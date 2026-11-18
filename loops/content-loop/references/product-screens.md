# Product screens

A product demo shows real screens being used: the app the person named, or
the builder making it. Each state of a screen is a 1440 x 900 PNG in
`F/assets/` (a mock-up at twice the pixels, `<name>@2x.png`), shown by a
`screen` scene whose shots click, type, zoom and call out, in the deck, the
slides and the video alike (the kit's
[scenes](../../../skills/demo-kit/references/scenes.md) § screen).

## Which screens

In the brief, list the flow the story walks, one row per step: the page,
the state it starts in (a list with two exceptions), what is clicked or
typed, the state that leads to (the record open, the form filled), and what
the callout says. Every state a click leads to is its own screenshot, and a
field that will be typed into is taken empty. Load `ua-safety`, then read
the app to know what exists:
`mcp__plugin_ua_application-builder__get_app_overview` for its pages and
`mcp__plugin_ua_application-builder__get_page_paths` for each page's path.

Every row is one of three, and the story sheet says which:

- **Captured**: the screen exists; take it signed in.
- **Mocked**: it does not exist, or taking it would show what it must not.
  Write it as an HTML page and picture it with
  `D shot F <page.html> --out <name>.png`. Its scene's footnote says
  "Illustrative screen". A UnifyApps logo on it is the kit's
  `logo-product.svg`, copied into `F/assets/` and shown in an `<img>`, never
  drawn ([the logo](../../../skills/demo-kit/SKILL.md#the-unifyapps-logo)).
- **Built**: only when the person asked, in their own words, for the screen
  to be built on their tenant: a draft page with illustrative data, through
  `ua-change` (the app-agent builds it; nothing is published).

## Capturing a screen of an app on this tenant

The folder must be set up (`/ua:setup`), so the browser signs in as the
person. `B` is
`bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-node.sh" "${CLAUDE_PLUGIN_ROOT}/skills/app-verify/scripts/browser.mjs" F/build/browser`.

```bash
B open-page "https://<host>/p/0/interfaces/<appId>/preview/<path>"
B resize 1440 900
B snapshot                      # the controls, each with a ref such as e12
B click e12                     # reach the state the shot needs
B screenshot --filename=queue.png
```

A screenshot from the app is 1x, so keep its zooms to about twice its size;
a mock-up pictured with `D shot F <page.html> --scale 2` stays sharp closer.

The file lands in `F/build/browser/queue.png`; copy it to `F/assets/`. Read
it before you use it: a screen still loading, an empty list or an error is
not a demo. For the builder, open
`https://<host>/p/0/interfaces/<appId>/builder/page/<pageId>` the same way.
`B close` when every screen is taken.

## Capturing a screen of another site

A public page, or an app the person signs in to themselves: load the
Playwright tools with ToolSearch
(`select:mcp__plugin_ua_playwright__browser_navigate,mcp__plugin_ua_playwright__browser_resize,mcp__plugin_ua_playwright__browser_take_screenshot`),
`mcp__plugin_ua_playwright__browser_resize { width: 1440, height: 900 }`, navigate, and
`mcp__plugin_ua_playwright__browser_take_screenshot { filename: "F/assets/<name>.png" }`. If
it asks for a sign-in, use the screenshots the person gave for that app; with
none, mock the screen, and the story sheet names the sign-in it needed.

## What a screen may show

- No real person's name, photo or email, and no other company's logo. Use
  illustrative records; if a real one shows, retake it or crop it out.
- Nothing the client told us in confidence unless the story is only for
  them, and the story sheet says so.
- The click points, typing points, zoom rectangles and callout points in
  story.json are in the 1x layout's pixels: read them off the 1x image (a
  1440 x 900 shot is 1440 wide), even when the file is `@2x`.
