# Browser extension — getting an extension's build for a run

Some apps are used through a Chrome extension: the app opens in the
extension's side panel beside the page it acts on (a copilot that clicks a
button on the page, say). A scenario that does anything in that panel
installs the extension in the test's browser, and its `scenarios.md` entry
names the extension, so the person sees it at approval. Only the side
panel is supported; a scenario that needs the extension's popup moves to
"not covered". A test with an extension runs on desktop and on Chromium
only, whatever device and browsers the run has
([devices-and-browsers.md](devices-and-browsers.md)): its run-file entry
carries the desktop device.

The run gets the extension the way it gets an uploaded file, once per
extension:

1. **Ask for its build** in chat: the path of the `.zip` (or `.crx`) on this
   machine, the same file a person uploads under the test's Browser
   extensions settings. Never ask for a link or the person's own upload.
2. **Read its manifest** from the file without unpacking it, e.g.
   `unzip -p <file> manifest.json`. It must have `"manifest_version": 3` and
   a `side_panel.default_path`; when it has neither the side panel nor
   version 3, say why and move its scenarios to "not covered". Note
   `name`, `version` and `side_panel.default_path`. A `name` of the form
   `__MSG_…__` is a translation key: ask the person what the extension is
   called and use their answer as the label, keeping the raw value as
   `manifestName`. Then read the panel page itself
   (`unzip -p <file> <side_panel.default_path>`): when it hosts the app in
   an `<iframe>`, note that frame's selector, and ask the person once which
   URL the panel's app is served at, since the helpers walk it there
   ([local-rules.md](local-rules.md), _Extension side panel_).
3. **Warn and upload it** exactly as SKILL.md, _Generated or uploaded file_, steps 2
   and 3 say: the same question, and on `Upload it publicly` the same
   `upload_public_file` call with `mimeType` `application/zip`. Its reply's
   `file.url` is the extension's link.
4. **Build its entry** — the object `deliver_steps` takes in `extensions`
   ([submission-contract.md](submission-contract.md)):

   ```json
   { "id": "ext_<slug of the label>", "name": "<label>",
     "fileUrl": "<file.url>", "fileName": "<the file's name>",
     "manifestName": "<manifest name>", "version": "<manifest version>",
     "surfaces": ["panel"] }
   ```

   Add `"users": [<test user ids>]` only when a scenario says some of its
   users do not have the extension; absent means every user has it.
5. **Hand it on.** Put the entry in the `extensions` of every run-file entry
   whose scenario uses the extension, with its panel app's URL and frame in
   `panelApps`, and add the link and manifest version
   to `scenarios.md`'s run header, so a fix round or a later run reuses it
   instead of uploading again.

A helper never uploads an extension; when its entry has none and the walk
shows the scenario needs one, it asks through `needs_answer`.
