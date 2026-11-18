# What a page shows, and what a user uploads

Two places where data the build did not write reaches somewhere it can run.

## Outside text stays text

A record value, a user's input, a file name, another system's answer and an AI
agent's answer are all data. Shown as text they do no harm. Put where HTML or
code is read, they run in the browser of whoever opens the page, an admin
included.

**Bind values to blocks and let the platform show them.** A bound value is
escaped. A value joined into HTML yourself is not.

Where data can reach on a page, and the rule for each
(`app-craft/references/custom-css-and-code.md` says how each place works):

- **Block HTML attributes** (`additional.htmlAttributes`): a `{{ }}` here is
  read when the page draws. Binding data into a `data-*` attribute is fine, and
  is how data changes a block's look. Never bind data into an `on*` attribute,
  `href`, `src`, `style` or any attribute the browser runs or opens.
- **Custom CSS**: a `{{ }}` is never read, so data cannot reach it. Keep it
  that way: no data in CSS by any other route.
- **Page header and footer code**: a `{{ }}` inside script text can read the
  signed-in user's fields (`user`, `customer`). Never place one inside a
  string that becomes HTML or code. No `eval`, no `innerHTML`, no
  `document.write` with data.
- **Table HTML columns and rich text** (the `blocks/table/columns/html` and
  `blocks/rich-text` knowledge sheets): these show HTML. Never bind user-typed
  text or an AI agent's answer into them without removing the markup first.
- **A URL the page will open, load as an image, or navigate to**: never built
  from a record or user input without checking it against a list
  ([secrets-and-config.md](secrets-and-config.md)).

**Rich text and Markdown are HTML.** A field a user types into that is shown
as HTML needs its markup removed, or cut down to a short list of allowed tags,
when it is saved. Doing it only when it is shown fails the first time another
page shows it without the clean-up.

**An AI agent's answer is the same problem.** A model can be talked into
writing HTML, so an answer shown as HTML can run code in the browser.

## Files a user uploads

A file's name, type and size all come from the user's browser, and all can be
false.

- **Read the file upload block's knowledge sheets first** (`blocks/file-upload`,
  `blocks/file-upload/storage`, `blocks/form/fields/file-uploader`). Set every
  limit they offer: allowed types, size and count. Allow a named list of types
  the requirement needs, such as `pdf` or `png`, rather than blocking a list.
  `svg` and `html` can run code in a browser, so never allow them unless the
  requirement needs them.
- **When the block has no setting for a limit**, build the rest and add an
  `unverified` line naming the limit the platform does not let you set.
  Checking a file's real content, and scanning it for malware, belong to the
  platform; name them in the same way when the requirement needs them.
- **Never build a path from a file name.** Store a file under an id the build
  makes, and keep the original name only as a field to show. A name with
  `../`, a double ending (`invoice.pdf.html`) or odd characters is an attack.
- **Check the owner on download too.** A file's link is an id like any other,
  and a stored file has the same owner check as the record it belongs to
  ([access-control.md](access-control.md)).
- **A spreadsheet or CSV export is data, not a document.** A cell starting
  with `=`, `+`, `-` or `@` runs as a formula when someone opens the export in a
  spreadsheet app. Put a `'` before such a cell on export.

## Exports and documents made from data

The same rule, going out. A PDF, an email body or a webhook payload built by
joining record text holds whatever that text holds. Build them from templates
with bound fields.

## What proves it

The stored config, read back: each block's HTML attributes, each HTML column
and each page code side read in full, with data only as a binding in an allowed
place. For uploads: the limits the block's settings hold, read back, and an
`unverified` line for each limit it could not hold.
