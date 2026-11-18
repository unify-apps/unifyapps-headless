---
user-invocable: false
name: app-localization
description: "Only for the app-agent builder agent. Shows a no-code app's pages, blocks, forms and text in more than one language: an app's default and supported languages, and the per-page translated text that makes a language actually useful. Load it to add or remove a language, set the default, find what on a page can be translated, read or write a page's (or the app-wide \"common\" namespace's) translated text, or find out why a translation did not save. The seven tools on application-builder for this (get_translatable_fields, sync_app_namespace, list_app_namespaces, get_app_namespace, get_deployed_app_namespace, save_app_namespace, save_app_namespaces) are not live on every tenant yet, so say so rather than reaching for the platform another way — never a per-language condition inside a block's own content; adding or removing a language itself already works today through update_app_settings."
---

## What this is

An app can have a **default language** and any number of **supported
languages**. End users see the app's pages in whichever language they land
on, with every block's text, labels and form fields shown in that language
where a translation exists, and in the default language where it does not —
never a blank, never a raw key.

A language by itself does nothing: it is just a code in a list until text is
translated for it. The text lives in **namespaces** — one per page (or the
app-wide **"common"** namespace, for text not tied to one page, such as
navigation) per language. Adding a language and translating its text are two
separate jobs.

## The MCP server

Every tool here is an MCP tool on the `application-builder` server, the same
one every other app/page tool is on. Call them like any other MCP tool.
There is no CLI. **Every call takes `host`** (the signed-in tenant's
`https://` origin) **and `appId`** (the app's id).

**`get_translatable_fields`, `sync_app_namespace`, `list_app_namespaces`,
`get_app_namespace`, `get_deployed_app_namespace`, `save_app_namespace` and
`save_app_namespaces` are not live on every tenant yet.** Until a tenant has them, say plainly that
reading or writing translated text is not available there — do not write
directly to an `e_i18n_namespace` record through any other surface, and
never fake a language switch with a `{{ lang['value'] === 'ar' ? ... : ... }}`
condition inside a block's own content: that is never translated by the
platform's own translation screen, auto-translate, export or import, all of
which work on namespace rows only. Adding, removing or defaulting a language
is unaffected: that already works today through `update_app_settings`,
described below.

**A page built or changed through these tools (not through a human saving
it in the browser builder) has no default-locale namespace yet.** The
browser builder computes "what can be translated" and writes it as a side
effect of every save; a page nobody has opened there has nothing stored, and
`save_app_namespace` refuses every key until something exists to refuse
against. `get_translatable_fields` computes the same list straight from live
page config, and `sync_app_namespace` writes it into the default-locale
namespace — run both before the first `save_app_namespace` on a page this
agent built.

## Adding a language, in order

1. **See what the app already has.** `get_app_overview` returns
   `locale.defaultLocale`, `locale.supportedLocales` and `locale.enabledLocales`
   (the union of both — the only codes the app can ever switch to). An app
   that has never had a language added may have no `locale` block at all;
   that means "default language only," not an error.
2. **Pick a code from the platform's own language list**, not a free-typed
   one. The app tools check codes against the builder's language picker.
   The underlying platform API has no such check, so use the picker code
   exactly as shown.
3. **Preserve the source language.** Keep `defaultLocale` unchanged when it
   is already set, even if this is the first additional language. If it is
   absent, use the language the app's source text was authored in. Do not
   use the new translation language as the default. If the source language
   is unknown, resolve it before saving. For example, adding `fr-FR` to an
   app whose default is `en-US` keeps `en-US` as the default.
4. **Add it.** `update_app_settings(appId, panel: 'locale', values: {supportedLocales: [...]})` —
   send the **full** list of codes the app should support, including the
   ones already there (this panel merges onto the stored record, but
   `supportedLocales` itself is replaced whole, not appended to). Adding a
   code already present is harmless but pointless — check `enabledLocales`
   first.
   When `defaultLocale` was absent, include the source language as
   `defaultLocale` in this same call. Save both fields together so the app
   never has supported languages without a default. The default controls
   the builder canvas and fallback text for missing translations.
5. **Read it back.** `get_app_overview` again; confirm the new code is in
   `enabledLocales`.
6. **Translate its text.** See "Translating a page, in order" below — adding
   a language does not translate anything by itself.

## Translating a page (or "common"), in order

1. **Find what can be translated.** Call `get_translatable_fields` with the
   page's component id (or `"common"`). It scans the page's own live config —
   not `e_i18n_namespace` — and returns `{path, defaultValue}` for every field
   it can read, plus `skippedBlocks` for the block types and fields it
   cannot scan yet (Table, GroupTable, NestedTable, Form, Module,
   TemplateComponent, notification text in events, and some array and
   add-on fields). A non-empty `skippedBlocks` means the page may hold more
   translatable text than `fields` shows — say so rather than treating the
   list as complete.
2. **Seed the default-locale namespace.** Call `sync_app_namespace` with the
   same component id. It writes exactly what step 1 found into the app's
   default-locale namespace, creating the row if none exists, and reports
   `written` and `prunedKeys`. Run this before the first `save_app_namespace`
   on a page this agent built or changed — without it there is nothing for a
   translation to attach to. Running it again when nothing changed is a
   no-op (`updated: false`).
3. **Find the namespace for another locale.** Call `list_app_namespaces` without
   `locale` for the app's default language, or pass a language to inspect another one. It lists
   pages (by component id) and "common" that already
   have a namespace row in that language. A page with no row yet in that OTHER
   locale has no translations for it — that is the normal starting state, not
   an error.
4. **Read the default-language text.** `get_app_namespace` with the
   page's component id (or `"common"`) and the app's `defaultLocale` — this
   should now match what `get_translatable_fields` returned in step 1. The
   keys that exist here are the **only** keys you may translate — a key
   that is not in the default-language namespace cannot be added to any
   other language's namespace; `save_app_namespace` refuses it.
   For a device translation, also read `devices.<device>.translations` in
   the default namespace. Its key and bindings must exist there.
5. **Write the translation, for every language at once.** When the app has
   more than one other language, call `save_app_namespaces` once, not
   `save_app_namespace` in a loop: `translations` is locale → key → text, one
   entry per language, using the exact same keys read in step 4. It checks
   every language against the same default-namespace read and refuses the
   whole call if any language's keys or bindings are wrong — never some
   languages saved and one silently skipped. For a single language, or a
   device translation (`deviceTranslations: {mobile: {key: "text"}}` on
   either tool), `save_app_namespace` still works the same way it always did.
   A key whose default-language value contains a `{{ binding }}` must keep
   the exact same binding(s) in the translated value, for every language —
   moving the surrounding words is fine, dropping or adding a binding is
   refused.
   Inspect `prunedKeys` (per language, on `save_app_namespaces`) before
   accepting the result: it lists older keys removed because the default
   namespace no longer has them.
6. **Read it back.** Check `readBack`, `readBackDevices`, and `notStored` for
   each language, then call `get_app_namespace` again for each language to
   confirm it.
7. **To check what a published app actually serves** (not what the builder
   has saved, which can be ahead of what is deployed), use
   `get_deployed_app_namespace` instead of `get_app_namespace`.

## The tools

### Already live today

- **`get_app_overview`** — an app's `locale` block: `defaultLocale`,
  `supportedLocales`, `enabledLocales`.
- **`update_app_settings`** with `panel: 'locale'` — add, remove or change
  the default language, and toggle "ignore the visitor's browser language"
  (`values: {ignoreBrowserLocale: true}`, public apps only). Takes
  `defaultLocale`, `supportedLocales` (the whole list, not an append) and
  `ignoreBrowserLocale`. Returns `readBack` and `notStored`.

### Not live on every tenant yet

- **`get_translatable_fields`** — which text on a page (or `"common"`) can
  be translated, computed from the page's live saved config, the way the
  browser builder computes it on save. Takes `appId`, `componentId` (a page
  id, or `"common"`). Returns `fields` (`{path, defaultValue}`), `devices`
  (per device, only the fields that differ from the base device), and
  `skippedBlocks` — every block or field it cannot scan yet (Table,
  GroupTable, NestedTable, Form, Module, TemplateComponent, notification
  text in events, some array and add-on fields), each with why. Never read
  an empty `fields` with a non-empty `skippedBlocks` as "nothing to
  translate". Reads config only; never touches `e_i18n_namespace`.
- **`sync_app_namespace`** — write the default-locale namespace from a
  fresh `get_translatable_fields` scan, creating the row if none exists.
  Takes `appId`, `componentId`, optional `dryRun`. Returns `written`,
  `prunedKeys` (a device key reads `<device>:<key>`), `skippedBlocks`, and
  `updated` (`false` when nothing changed, so nothing was sent). Refuses
  when the app has no `defaultLocale`. The stored keys of a block in
  `skippedBlocks` are kept as they were — this tool cannot see them, so
  their absence from the scan proves nothing. Run this before the first
  `save_app_namespace` on a page built or changed through these tools.
- **`list_app_namespaces`** — namespaces for one language, by page/common,
  with a key count. Takes `appId`, optional `locale`, and `includeCommon`
  (default true). If `locale` is omitted, it uses the app's default language
  and reports which language it used. Pass a locale to inspect another one.
  If the app has no default set, pass a locale explicitly.
- **`get_app_namespace`** — one namespace's full translated-text map. Takes
  `appId`, `componentId` (a page id, or `"common"`), `locale`.
- **`get_deployed_app_namespace`** — the same, but from what is actually
  published, not what the builder has saved. Same inputs.
- **`save_app_namespace`** — write or update translated text, for ONE
  language. Takes `appId`, `componentId`, `locale`, `translations` (key →
  text), and optional `deviceTranslations` (device → key → text). Refuses a
  key absent from the default-language namespace; device keys must exist in
  that namespace's matching device override. Also refuses a translated value
  whose bindings don't match the default value's bindings. Empty text removes
  that value. A dry run returns the planned mutation. A save returns
  `readBack`, `readBackDevices`, `notStored`, and `prunedKeys`.
- **`save_app_namespaces`** — the same write, for every language in one
  call. Takes `appId`, `componentId`, `translations` (locale → key → text,
  one entry per language), and optional `deviceTranslations` (locale →
  device → key → text). Use this instead of calling `save_app_namespace` in
  a loop whenever more than one language needs the same batch of text: it
  reads the default namespace once for every language, and refuses the
  whole call — nothing written for any language — if one language's keys or
  bindings are wrong. A dry run returns every language's planned mutation. A
  save returns `locales`, one entry per language with the same `readBack`,
  `readBackDevices`, `notStored`, and `prunedKeys` shape `save_app_namespace`
  returns.

## One-way actions

These tools do not delete a namespace row. An empty text value in
`save_app_namespace` removes that key's translation. Removing a language
(`update_app_settings` with a shorter `supportedLocales` list) does not
delete that language's translated text — see "Traps" below for what it
actually does. Check `prunedKeys` on a dry run before saving if the target
namespace may hold older keys. A pruned key cannot be restored through this
tool unless it exists again in the default namespace.

## Traps that answer 200 and do the wrong thing

- **Removing a language from `supportedLocales` does not delete its
  translations.** They become unreachable through the normal UI and tools
  unless you name that locale when listing namespaces. The `e_i18n_namespace` rows are left exactly as
  they were. Re-adding the same code later brings back whatever was last
  saved — stale, not fresh. If the person wants a clean slate for a
  re-added language, say this plainly rather than assuming the data is
  gone.
- **Two namespaces can exist for the same page and language.** Nothing on
  the platform stops a duplicate. `save_app_namespace` checks for this and
  refuses rather than guessing which one to update, but a namespace read
  through any other path could in principle return two rows for what
  should be one; treat that as a sign something upstream double-wrote, not
  as normal.
- **The underlying platform accepts free-text locale codes.** The app tools
  validate them against the builder's language list before writing. Always
  use a code from that list.
- **A write error never shows up as a 4xx status.** A missing app, a
  forbidden write, a stale save — all of it comes back as a generic server
  error at the HTTP level. The tool's own error message carries the real
  reason; read that, not the status code.
- **Adding a language the app already has is silently harmless, not an
  error** — but sending `supportedLocales` without a code the app already
  had removes that code (see the first trap above). Always check
  `enabledLocales` before writing a new list, and send the complete list
  you want, not just the one code you're adding.

## What no tool does

The platform has no tool, and no reliable way for UnifyApps Headless to drive, these
three jobs — all three depend on a tenant having separately configured an
automation for the purpose, which cannot be assumed or checked generically:

- **AI auto-translate** — translating a language automatically from the
  default. Say this needs the UnifyApps team to configure it on this
  workspace; do not attempt a workaround.
- **Export labels** to a spreadsheet.
- **Import labels** from a spreadsheet.

Also not available through any tool:

- **Seeing exactly what an end user will see**, combining their locale,
  cookie and profile. This is a client-side decision the app's runtime
  makes, not a platform call. Load a real page with the app-verify browser
  tool and pass `?locale=<code>` in the URL to see it directly, rather than
  trying to compute the answer.
- **Cross-page "apply this same translation everywhere"** — this is a
  convenience the builder screen offers while editing, not a platform
  action. To translate the same source text on several pages, write each
  page's namespace with `save_app_namespace`, once per page.

## What has been checked, and what has not

**These rules hold:** the shape of an app's language settings and of a
populated translation namespace, that an app with no language ever added has no
language settings at all, that an app with no translations returns no rows, and
that duplicate namespace rows can exist and are refused by the save tool.

**Not yet settled:**

- Whether a namespace's full version history can be read back the way an
  app's can *(unverified)*.

Take the steps one at a time, and read a namespace back after every write
until these are confirmed.
