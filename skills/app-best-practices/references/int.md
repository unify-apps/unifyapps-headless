# Configuration integrity

Ids resolve, nothing is orphaned, deprecated patterns are gone.

124 rules: P0 8, P1 69, P2 33, P3 14.

## Contents

- P0
- P1
- P2
- P3

## P0

- Remove duplicate page slugs and duplicate sibling segments.
- Set both moduleId and moduleInterfaceRecordId on a Module embed; moduleId alone does not load.
- Set both templateComponentId and templateInterfaceRecordId on a TemplateComponent, copied from one options row.
- Point submitForm formId at an existing Form block; a stale id runs onSuccessActions over a form that never submitted.
- Never store both content.blockId and content.blockIds on one block; the next save deletes every child in the list.
- Use only slot keys the block declares; an invented slot key's subtree is deleted on the next save or builder open.
- Point page layout.body, header and footer at existing blocks (root_id, header_id, footer_id); a missing body id renders blank.
- Store block visibility only at block.visibility; a condition under component or appearance is ignored and the block always shows.

## P1

- Delete unused page variable from the page for better performance.
- Delete unused page function from the page for better performance.
- Delete unused page data source from the page for better performance.
- Delete unused page blocks (check switched off in the builder).
- Remove deprecated CodeEditor content binding.
- Give blocks, variables and functions on a page unique names.
- No dangling references in the dependency graph.
- Place every page the tree reports with a null address.
- Reconcile any `parentId` that disagrees with the parent's `children` array.
- Attach segments the root can't reach, and pages holding a slug no segment holds.
- Check config arrays like a Carousel's `items[].blockId` before calling an outline `unreferenced` block an orphan.
- Switch `header_id` / `footer_id` visibility on after filling them.
- Replace deprecated block types.
- Every cross-reference id resolves: navigation, action payloads, parentId, slots, dpOn paths.
- Data source references resolve by id or by name.
- Every block is reachable from body, header or footer.
- No cycles in parentId chains.
- Every data source dpOn names blocks that still exist.
- Treat `Handler with ID … already registered` as module double-mount noise until config shows a real duplicate.
- Keep the platform prefix on block ids; an id like startWithEntityDataTable drops out of dependencies, so its source never refetches.
- A Module block nested in another module names the module's interface (moduleInterfaceRecordId or moduleId$$interfaceId), not a bare id.
- No block lists the same child id twice in content.blockIds.
- A saved dependency list (dP, dpOn) never names the block itself or a runtime-only path such as currentData[1].role.
- After cloning an app, check its custom login, signup, MFA and password pages use the clone's ids and the clone has a domain mapping. (web only)
- No image, icon or font URL points at another tenant, environment or localhost; host every asset on the app's own tenant.
- A module embedded from another app runs that app's deployed version; publish it before the host or the host shows old behaviour. (web only)
- Every embedded module id resolves to a live, published module; a deleted module fails with a 500 on each page load. (web only)
- Host every image on the app's own tenant: no other-environment links and no data: image values in blocks or variables.
- Get every page and every automation it calls above a Best Practice score of 90 before review; treat 90 as a floor.
- Place no visible blocks on the global page; its blocks render nowhere.
- A public page never reads global-page variables or functions; they read as nothing there. Keep its constants on the page.
- Never put a header, menu or banner block on the global page; it is stored and never drawn.
- Copy every enum and token value exactly as its sheet gives it; an unknown value is silently ignored.
- Remove duplicate rows from CSP lists, app variants and Pusher channels or events; a duplicate Pusher event runs its actions twice.
- Compare a Stepper's activeStepId or a Tabs' activeTab only to a value its own steps or tabs list; any other never or always fires.
- Keep the same child list under every block on every device; per-device overrides change props, not the tree.
- Store closed-set keys (variant, type, mode) as one of the values the block's sheet lists; others store and render wrong silently.
- Pass a Drawer, Modal or ContextualDialog only the inputs its target page declares; other names are silent no-ops.
- Keep action and option ids stable when editing in place; every event pointing at the old id stops firing.
- Keep every Form field present in schema, layout and ui:order together; a field in only one half half-exists.
- After renaming a form field key, update every binding that named the old key; nothing follows the rename.
- After turning on multipleFiles, index every binding to that field ([0]); single-file paths stop resolving.
- After switching a slider or date field to range, update bindings; the value becomes an object.
- Remove a stored appearance.disabled: true the panel can't show unless the button is meant to be dead.
- After repointing a Modal, Drawer or Module at another page, rewrite its inputs for the new target.
- After repointing a TemplateComponent, rewrite its inputs, overrides, slots and inbound event ids.
- Spell event types exactly as the block declares them (onClick, not OnClick or on_click).
- Write controlModal, controlDrawer and controlMediaUploads operation explicitly; the builder default is not stored.
- Point controlDrawer at a Drawer on the same page as the trigger, and controlModal at a real Modal block.
- Use operation values like setLanguage or logout inside controlUser, never as the actionType.
- Write variableId and functionId as literal ids; a {{ }} there never resolves and the action dies silently.
- Reference entities in bindings by id (var_x, func_x, e_x, b_x), never by display name; a name fails silently.
- Read a module's output off the Module block id and its inputs inside as pageInputs; wire each outbound event by eventType.
- Embed another app's module with moduleId <moduleId>$$<interfaceId>.
- Send a TemplateComponent or Module inbound event only by a name it declares; a missing inboundEvent fails silently.
- Omit targetId on block-level handlers and copy column and field target ids from the block; a miss never falls back.
- Keep a Repeatable's row template out of every parent child list, or it renders twice.
- Build page content inside root_id; a second root Stack is never rendered.
- Keep event definitions in page.events and handlers in interactions.events; the wrong shape in either is dead.
- Give every declared page output a matching entry in output; a declaration alone publishes nothing.
- After renaming a page input, update every link, embedding block and binding; nothing follows the old name.
- Don't set isTemplate on a working app page; it hides the page from the app while still routing to it.
- Point integrations.copilotChat.interfaceId at a separate COPILOT app, never the current app.
- Never store visibility or enabled as {value:'conditions'} without a conditions payload.
- Never bind a data source's previewResult; it is filled only by builder preview runs and empty in the app.
- Give page-input reads a fallback unless the inputSchema layout carries ua:valueSemanticsVersion 2; defaults skip published apps.
- Read inputs inside a module or template component from pageInputs; pageParams of the host are never passed in.
- Don't call controlBlockMethod from a host on a block inside a module; drive it through module inputs and events.
- Fill every key a block's chosen mode requires (mapped mode its mapping, page variant its pageId, snapPoints mode its points).

## P2

- Initial Value of Variable Should Not Use Data Source.
- Remove deprecated localStorage['values'] references.
- Remove or complete empty on-click interactions.
- Replace the old stepper block with the new one.
- Don't hardcode runtimeBlocks or runtimeBlockKeys.
- Don't nest expression markers.
- Check an Image's `content.data.src` against its `uploadDetails.source`.
- Declare what a module exposes.
- Re-read the page after any structural move.
- dataSourceIds hold data source ids, never JS tokens such as event or window.
- Flag a variable name defined at two scopes; the closer one wins at runtime.
- Visibility "conditions" has a conditions payload; a literal true or false carries no leftover conditions.
- Template slot roots carry isSlotRoot and slotName; overrides touch only eligibleOverrides.
- customBlocksVersionsMap covers every custom block in use.
- A Slot block sits only inside a template component; on a normal page its children never render in Preview or the published app.
- Block variant, color and size values come from the allowed set plus the theme's own names; an unknown value renders unstyled with no error. (web only)
- Point every active walkthrough at an existing page, and each step at a block that still exists. (web only)
- Store additional.htmlAttributes as an array of {key, value}, not a map. (web only)
- Put Typography and Button text in content.value; content.text or content.label render nothing.
- Keep one translation namespace per page and language; a duplicate means something double-wrote.
- Make data source and folder names unique across the whole app, not only on the page.
- No action repeated on one event with the same payload.
- Start a walkthrough from a button only once it is active and published; a draft or inactive tour does nothing on click. (web only)
- Every icon name a block stores or a binding resolves to exists in the icon catalog; an unknown one draws nothing.
- When dropping a Table column, clear its slot blocks and re-point or remove its handlers first.
- Don't hand-write a TemplateComponent loader id or share one across duplicated placements.
- Keep one block per slot and never nest a Slot directly inside another Slot.
- Switch a handler off with disabled true, not hidden; hidden handlers still fire.
- Emit every declared page event from an action; a declaration alone never fires.
- Never name a page input pageInputs; the name is reserved.
- Store component overrides as deltas keyed by source block ids with componentType, never a merged copy.
- Give list rows saved in pages and data sources (key-value params, tags, conditions) a stable __id; never re-mint one on saved rows.
- Remove content and appearance keys the block's contract does not declare (misspellings, wrapper objects); nothing reads them.

## P3

- Remove empty actions (trigger data source actions).
- Remove Deprecated __PAGE_VARS__ References.
- Remove deprecated __PAGE_FUNCTIONS__ references.
- Remap localStorage['values'] bindings from the input data panel.
- Report abandoned blocks when default numbering has gaps; don't delete them unasked.
- Prefix temp ids `tmp_` and never name one like a data key.
- embeddedEntityReferences matches the blocks actually used.
- Reach entities by id, never by name.
- Drop dependencies.documentTitle from a page with no document title; the stale entry still points at the old data source.
- Don't store collectChildStates true together with addOns.page on a Repeatable; the builder forces it false.
- Remove copied method trigger leftovers from new setPageVariable, executeScript and submitForm payloads.
- Keep folders one level deep; never set a folder's parentId.
- Write a page event payload as a schema, not a sample value.
- Remove formatting keys a field's current type doesn't read, like currencyCode after a switch to NUMBER.
