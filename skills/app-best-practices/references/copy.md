# Naming, copy and localisation

Names a builder can read, words a user can read.

62 rules: P0 0, P1 8, P2 21, P3 33.

## P1

- Names start with a letter, have 3+ characters, use only letters, digits and underscores, avoid reserved words.
- Never switch language with a locale condition inside block text; translate through the app's namespaces.
- Set defaultLocale, the language the source text is in, whenever supportedLocales is set.
- Bind a Tag label or Typography value to a string field; a bound object shows [object Object] or raw JSON.
- Replace the seeded Typography text Hello {{ userContext.name or 'world' }}; it renders in the published app.
- Build a real confirm step (a Modal) for destructive actions; an action's confirmation field is never read.
- Translate text through namespace rows, never a {{ lang === 'ar' ? ... }} ternary.
- Keep every translated key in the default locale row; saving another locale prunes keys the default row lacks.

## P2

- Use descriptive and meaningful module names.
- Localisation string mapping is missing for one or more components.
- Replace seeded or generic words like Label, Enter Value, Button, Tab 1, Submit, No data.
- Keep enabled locales aligned with the locales the UI offers.
- No placeholder text: "Enter text", "Lorem ipsum", "placeholder", "image1".
- No near-duplicate names that differ only by case or separator.
- Word the primary button as its result; a destructive action confirms, naming the item.
- Error notifications explain in plain words, never ECONNREFUSED or "Something went wrong".
- Confirmations say what will happen, not "Are you sure?".
- A public app meant for one language turns on Ignore browser language and is republished. (web only)
- Locale codes in supportedLocales match namespace codes exactly (fr vs fr-FR) and the default locale is listed there too. (web only)
- Translate each embedded module's own text and drop translation keys for deleted blocks; stale keys hide new text.
- Replace default menu labels like "Nav Item 2" or "Nav Group 1".
- Word confirmation buttons as the action and its opposite (Delete lot, Keep it), never Yes and No.
- Use locale codes from the builder's language picker; the platform also stores free-typed codes.
- Keep every {{ }} binding of the default-language text in each translation of it.
- Give every page of a multi-language app a default-locale namespace; a page built by tools has none until synced.
- Translate every default-namespace key for each supported locale; a language with no text only shows the default.
- Never show a status code, record id or raw field name on screen; show a label.
- Turn on locale.ignoreBrowserLocale on a public web app that must open in its default language, not the visitor's browser language. (web only)
- Copy setLanguage locale codes verbatim from enabledLocales; normalising hi to hi-IN switches nothing.

## P3

- Organise resources into folders when exceeding 10 items.
- Rename detached blocks for better visibility.
- Rename generic variables to be descriptive.
- Rename generic functions to be descriptive.
- Rename generic data sources to be descriptive.
- Name every block you create.
- Rename in-scope blocks still carrying default names like `stack27`, `text64`, `image5`.
- No empty Typography blocks.
- Names describe purpose: no component-type, 4-letter or generic names (data, temp).
- Block display names are camelCase, intent-led and unique: no form2 or button5.
- Page names match their navigation labels.
- One casing style per scope.
- Name blocks for their role as camelCase identifiers, `loginSubmitButton` not `button4`.
- Do the rename pass as one batch before any structural cleanup.
- Name a Repeatable for its data and its template for the row, `policiesList` / `policiesRow`.
- Name page variables for the value they carry, not the widget.
- No typos in user-facing strings.
- Empty states guide the next step; success messages confirm what happened.
- Correct plurals, sentence case, units beside numbers, a tooltip on truncated text.
- Keep body copy to two em dashes or fewer.
- Label fields and menus in the person's words, never the object's field key or how the system is built (Webhook config).
- Make page and menu titles specific (Bean lots, Roast log), never Items or Records.
- Drop a subtitle that restates the title and help text that restates the field label.
- Put the action that fills an empty state right beside its message.
- Name the changed record in a success message (Order WO-4081 moved to Packed), never just Success.
- Remove an eyebrow label (often ALL-CAPS, wide-spaced) above a section heading that only restates it.
- Drop middle-dot meta lines (A, B, C joined by dots) and an arrow added to every button and link.
- Cut product-agnostic filler copy such as Transform your workflow, Seamless or All in one place.
- Check table columns, form fields, modules and notification text for translations by hand; the scan skips them.
- Never put a folder inside a folder.
- Keep UPPER_SNAKE constants as page variables inside a constants folder.
- Write an ARRAY field's addLabel as the noun only; it is prefixed with Add, so Add line reads Add Add line.
- Use showNotification type success, info, warning or error with a literal autoHideDuration number.
