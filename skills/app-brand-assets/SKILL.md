---
user-invocable: false
name: app-brand-assets
description: Makes a MOBILE app's icons and splash screen from one logo image the person gives, sized to the iOS, Android and Expo standards, and sets them on the app. It covers the iOS light, dark and tinted icons, the Android adaptive and themed icons, the notification icon, and the light and dark splash images. It lifts the parts the person names off the logo, such as the symbol alone for the icons or the symbol with the name for the splash, shows a preview for their yes, uploads the files and writes the app's Brand Assets and Splash Screen settings. Use when the person asks in chat to set, make or change an app's icon, app logo, brand assets, launcher icon, splash screen or launch screen.
---

# App icons and splash screen from a logo

The person gives one logo and says which part goes where. This skill makes every file the
phone build needs, at the exact size and format each platform asks for, shows them, and on
their yes puts them on the app. The main session runs it; no builder agent does.

Every command below runs as
`bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-node.sh" "${CLAUDE_PLUGIN_ROOT}/skills/app-brand-assets/scripts/brand-assets.mjs" <command> ...`
from the solution folder. Work in `.sessions/<sessionId>/drafts/brand-assets/` (the work
folder below): the upload reads files only from inside the solution folder.

## What it makes

| File | Setting | What it is |
|---|---|---|
| `icons/ios-light.png` | Brand Assets: iOS light mode logo | 1024 x 1024, opaque (no alpha channel), symbol 600 px across |
| `icons/ios-dark.png` | iOS dark mode logo | 1024 x 1024 transparent, with the dark inks swapped; iOS draws its own dark backdrop |
| `icons/ios-tinted.png` | iOS tinted logo | 1024 x 1024 transparent greyscale; iOS tints it |
| `icons/android-foreground.png` | Android foreground logo | 1024 x 1024 transparent, symbol 384 px across, inside the 66 dp safe circle |
| `icons/android-monochrome.png` | Android monochrome logo | Same shape in one flat colour, for Android 13 themed icons |
| `icons/notification-icon.png` | Notification icon | 96 x 96, white on transparent |
| `splash/splash-light.png`, `splash/splash-dark.png` | Splash Screen: image, dark image | 1024 x 1024 transparent; the farthest pixel stays inside Android 12's visible circle |

It also sets the Android background colour (a solid colour behind the foreground, white unless
the person gives one, so no background image is needed), the notification colour, both splash
backgrounds, and the splash image width, 288 dp, the size Android 12 draws a splash icon at.

## Steps

1. **The app.** It must be a MOBILE app: a web app has no icons or splash screen here. Take its id
   from `solution context` or `cache app`, and ask which app only when the solution has more than
   one mobile app.
2. **The logo.** Use the image the person attached: its file path is in the conversation. Copy it
   into the work folder as `logo.png` (or its own extension). With no file, ask them to put the logo
   in the solution folder and say its name. Write the folder's full path (the working directory,
   such as `/Users/priya/acme-app`), never "this folder", and say how to get there on a Mac: in
   Finder, **Go > Go to Folder**, paste the path, then drag the logo in. Ask for a PNG at least 1024 px wide when they have a
   choice; an SVG cannot be read, so ask for a PNG export of it.
3. **Inspect.** `inspect --logo <work folder>/logo.png --out <work folder>`. Read the printed
   JSON, and look at `<work folder>/inspect.png`: each group of the logo boxed and numbered.
   A group is a mark (shapes inside each other's box) or one line of text. A symbol made of
   separate shapes, such as a grid of squares with nothing joining them, comes out as one group
   per row: list every one of them in the part.
4. **Write the recipe** at `<work folder>/recipe.json`, from the person's words and the rules in
   [references/recipe.md](references/recipe.md). It picks the groups for the icons and the splash,
   moves lines to close a gap left by a removed one, and says which inks change on a dark
   background.
5. **Make.** `make --recipe <work folder>/recipe.json --out <work folder>/out`. It prints
   `brand-assets.json`: every file with its size, and `warnings`. Fix what a warning names in the
   recipe and make again. Look at `<work folder>/out/preview.png` yourself: each icon under the mask
   the phone puts on it, the safe zones as rings, and the splash at its real size on a phone.
   Remake until nothing is cut off, unreadable or the wrong colour.
6. **Ask once.** Show the person the preview: give its full path, and on macOS open it for them
   with `open <path>`. List the colours you chose that they did not give. Then ask with
   AskUserQuestion: "Upload these files and set them as <app name>'s icons and splash screen?",
   with the options to upload and set them, change something, or keep only the files. The upload is
   public: anyone with a file's link can download it, as with every app icon. Their yes covers it.
7. **Upload and set.** Run `upload --out <work folder>/out --app-id <appId>` first: it reads both
   settings panels and lists the files and keys it would change, writing nothing. Then the same
   command with `--apply`: it uploads every file, writes the Brand Assets and Splash Screen
   settings (each a dry run, then the write against the app's current version) and reads both back.
   `ok: true` with `readBack: "every key matches"` is the proof; anything else, say what it names.
   `code: "PANELS_MISSING"` means this tenant cannot write these settings yet: hand the person the
   files and the table above, to add in the builder under Settings.
8. **Tell the person** what is set now, with the read-back, and that icons and the splash screen
   are built into the app: phones get them only after a publish and a new store build. Offer the
   publish as `ua-change` § Releases says; a store build is started by the person in the builder's
   release screen.

## When the logo does not fit

- **No symbol, only a wide wordmark:** icons from a wordmark are unreadable at launcher size.
  Ask the person for a symbol or a single letter to use.
- **A small logo:** `make` warns when the icon part is drawn over 2.5 times its source size, and
  refuses past 6. Ask for a larger file.
- **A gradient, a photo or shading:** `make` warns that the one-colour files may lose detail. Look
  at the themed, tinted and notification tiles before you ask.
- **A symbol cut out of a filled tile** (white lines inside a coloured square): the cut-out is the
  background showing through, so it cannot be lifted alone. Ask for the symbol on its own, on a
  transparent background.
