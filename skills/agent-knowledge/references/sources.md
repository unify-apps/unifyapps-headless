# Sources: what each kind takes

## Contents

- Every source
- A document
- A website
- An app
- A data catalog
- Changing a source
- What re-indexes a source

## Every source

`add_knowledge {agentId | knowledgeSetId, sources}` takes up to 20 sources in one call. Each
source takes `name`, `description` and `tags`, and exactly one of the four kinds below. Leave
`name` out to get the screens' name for it: the file name, the first URL, "App - action", or the
catalog's name. Pass `tags` only when the person asked for them; a source's tags are set only when
it is added.

A source on an agent belongs to that agent alone. A source in a set belongs to the set, and every
agent the set is given to reaches it. NEVER move a source between owners: remove it and add it
again where it belongs.

## A document

`file {fileUrl, fileName, contentType, size}`, all from `upload_file`'s answer: `fileUrl` is its
`file.url`, `size` its `file.size`. The upload takes a `filePath` in the work folder, at most
20 MB. A document is read once and never refreshed on a schedule; to read a new version, upload
it and change the source with `update_knowledge {items: [{knowledgeId, file}]}`.

## A website

`website {urls, crawlWholeSite, includeDocuments, pageLimit, crawlDepth, refreshFrequency}`.

- `crawlWholeSite: false`, the default, reads only the `urls` listed.
- `crawlWholeSite: true` follows links from them: at most `pageLimit` pages (default 100) and
  `crawlDepth` links deep (default 2). Start small; a whole site can be thousands of pages.
- `includeDocuments` also reads the documents the pages link to.
- `refreshFrequency` is `DAILY` (the default), `WEEKLY` or `MONTHLY`: how often the site is read
  again.

## An app

`application {appName, sourceId, connectionId, inputs}`.

1. `list_knowledge_apps` with no names lists the apps that offer knowledge, and whether each
   signs in (`needsAuthentication`).
2. `list_knowledge_apps {appNames}` lists each app's knowledge actions. Pick one: its `sourceId`
   is the action, its `inputSchema` is the shape of `inputs`, `defaultSchedule` is how often it
   syncs, and `newIndexingFlowEnabled` says whether it reports item counts.
3. An app that signs in MUST have a `connectionId`, an active one from `list_connections` on
   the `agent-builder` server, given the app's name. NEVER guess one; with none active, report
   `needs_confirmation` asking the person to connect the app.
4. `inputs` says what to read, such as which spaces, channels or folders. Keep it as narrow as the
   person asked: an app source with no narrowing reads everything the connection can see. Fill the
   keys the `inputSchema` lists as required, or the source is refused.

An app source reads with the one connection given, so it sees what that connection's account
sees. It starts on the action's default schedule; change it with `update_knowledge` and `general`.

**What the agent answers from an app is checked against the asking person.** Content from an app
that signs in, such as Google Drive, Notion or Confluence, reaches an answer only where the asking
person's own account in that app can see it. A source can be COMPLETED, and an answer to a person
who lacks that access still will not use it. That includes a `send_test_message` run, which asks
as the signed-in builder. No tool turns this check off, and the agent and set screens offer no way to
either. An app that does not sign in, such as Storage by UnifyApps (`storage_by_unifyapps`), follows
the person's access to those records instead.

## A data catalog

`dataCatalog {catalogId}`, from `list_data_catalogs`. The source is named after the catalog. A
catalog cannot be made from here; point at one that exists.

## Changing a source

`update_knowledge {items}` changes up to 20 sources, each `{knowledgeId, …}` with only what
changes:

- `name`, `description`
- `enabled: false` stops the agent searching it; `true` switches it back on and indexes it again
- `file` for a document, `website` for a website, `application {connectionId, inputs}` for an app.
  An app's `inputs` replace the stored ones whole: read them with `get_knowledge` first.
- `settings {indexing, enrichment, piiMasking, alerts}`: indexing settings, each replacing the
  stored value whole
- `general {scheduleEnabled, schedule, realtimeIndexing, retention}`: the sync schedule and how
  long items are kept, only for a source on the new indexing flow

Read a source with `get_knowledge` before changing it. Each answer reads the source back, and
`notStored` names any path that did not stick.

## What re-indexes a source

These send the source back to indexing (`reindexing: true`), and it is searchable again only when
`check_knowledge_status` says it finished:

- a new `file`, changed `website` pages, an app's `connectionId` or `inputs`
- any `settings`
- `enabled: true` on a source that was switched off: switching off left it in DRAFT, so switching it
  back on indexes it again

These do not: `name`, `description`, a website's `refreshFrequency`, `general`, and `enabled: false`.

To read a source again without changing it, use `resync_knowledge {knowledgeIds}`. A completed
source on a sync schedule gets a fresh crawl and stays COMPLETED while it runs (`syncInProgress`);
any other source goes back to indexing, which is how a FAILED source is retried.
