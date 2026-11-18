# Open a builder page

Use this after `/ua:setup` has selected a tenant, signed in and opened a solution. Resolving an existing app for the spec is read-only; writes wait for spec acceptance and the assigned plan task. Start from the user's builder URL or a known app id. Compare the URL's host with the selected tenant; a mismatch returns to tenant selection.

## Resolve the URL

- `host` is the URL's hostname, never the MCP server address.
- `interfaceId` is the segment after `interfaces/`. For `template-components`, `forms`, `fields`, `manager`, `ai-create`, or `generating-app`, use the following segment instead.
- Everything after `builder/` or `preview/` identifies a page path. A segment matching `e_[A-Za-z0-9_]+` is a page id (the platform's own form is `builder/page/<pageId>`); otherwise the final segment is a slug. Preserve the full path to disambiguate duplicate slugs.
- Preserve `?blockId=` as the selected block. Read it back before interpreting a request about "this" block.

Read `get_app_overview` with `{host, interfaceId}`. Resolve a slug with `get_page_paths`, matching the full path when needed; never pass a slug as a page id. With no page path (for example an app overview or `https://<host>/interfaces/<app>`), use the homepage reported by the overview. A supplied path with no match or several unresolved matches needs clarification from the main router before writes.

Read `get_page_outlines` for the resolved page. Confirm its path and the overview's `appType`; MOBILE loads `app-native` before block choices. Hold `host`, `interfaceId`, and `pageId` for every page tool call. Do not infer ids from a page title.

## A new app

Only a task that explicitly creates a NEW app does this. Call `create_app` with `host`, the accepted `name`, `type` and the app `id` the task gives. Outside a plan, make the id from the name: it becomes the app's sub-domain, so it takes lowercase letters, digits and single hyphens, never an underscore (`field-ops`). `create_app` wants `host` as the https origin (`https://<host>`), while every page tool takes the bare host name. Use the returned application id as `interfaceId`. In a plan, the first layout of the new app does this, then creates only its own page with `create_pages`; the other layouts wait on it and use the app id it reports. Read the app and paths back with `get_app_overview` and `get_page_paths`. Put the page's builder URL in the task report: `create_app` returns only the published app's `url`, so build it as below. A task that names an EXISTING app without coordinates uses its known id, or returns the missing builder URL question to the router.

## Build a builder or preview URL

The other way round, from ids to a URL: `https://<host>/p/0/interfaces/<interfaceId>/builder/page/<pageId>`, which the platform sends on to the page's own path, or `…/builder/<slug>` with the page's slug from `get_page_paths`. The same two forms work for `preview/`, where a page with params takes its address with real values. Never `…/builder/<pageId>`: a page id where the path goes opens the app's default page, with no error. `app-verify`'s browser scripts refuse to shoot that landing.
