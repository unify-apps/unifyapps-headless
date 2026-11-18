# What the Figma MCP tools return

Measured on an earlier rebuild (October 2026). Tool names as Claude Code lists them: `mcp__claude_ai_Figma__<tool>`. A View seat on a Professional plan is rate-limited at about one call per agent; a limited call answers with the text "You've reached the Figma MCP tool call limit for your View seat" and a `rate-limits-access.md` resource link. Nothing below is ever pasted into chat: the capture agent writes files and reports sizes.

## get_metadata {fileKey, nodeId}

XML of the node tree, no header, two-space indentation:

```xml
<frame id="1576:35599" name="Register" x="4778" y="1157" width="440" height="956">
  <frame id="1576:35613" name="Register" x="0" y="148" width="440" height="808">
    <text id="1576:41009" name="Title" x="0" y="6.5" width="215" height="11" />
    <instance id="1576:41010" name="Lighter/Chevron_Up" x="392" y="24" width="24" height="24" />
  </frame>
  <instance id="13530:33466" name="Status bar" x="0" y="0" width="440" height="62" />
</frame>
```

- Tags seen: `section`, `frame`, `text`, `instance`, `rounded-rectangle`, `rectangle`, `ellipse`, `line`, `vector`, `boolean-operation`. Attributes: `id`, `name`, `x`, `y`, `width`, `height` only. No visibility, no fills, no fonts, no text content: a text node's `name` is its text unless the designer renamed the layer.
- Positions are **relative to the parent** (95.6% of 3,700 children lie inside their parents read that way, 21% read as absolute). The root's own `x`/`y` are its place on the Figma page. `figma-spec.mjs` measures this on every file and records `sources.positions`.
- Children of an instance are often omitted (`<instance … />`), so a component's internals are opaque; its size and name remain.
- A text node's height is the cap-trimmed height when the design uses leading trim (11 for a 16/22 line), which is how the spec decides `textCapTrim` when no CSS export says it.
- Size: a 440×956 frame is 5–25K characters; a section of 75 frames is 435K and useless. Fetch frames only.

## get_screenshot {fileKey, nodeId, maxDimension}

One JSON content entry plus instructions:

```
{"image_url":"https://www.figma.com/api/mcp/asset/<uuid>.png","width":1755,"height":4000,"format":"png","original_width":9629,"original_height":22059}
curl -L -o screenshot.png "<image_url>"
```

`width`/`height` are the PNG's pixels (the longer side is `maxDimension`); `original_*` are the node's Figma points. `pxPerPt = width / original_width`, and the agent re-derives it from the PNG's IHDR after the download. The URL is short-lived and treated like a secret: downloaded at once, never written into a report. At `maxDimension 4096` a 440×2635 frame comes back 684 px wide: fine for judging, coarse for crops; the person's PNG export (2048 px wide for the same frame) is better when it exists.

## get_design_context {fileKey, nodeId, clientFrameworks, clientLanguages, skillNames}

React + Tailwind code for the node, every element carrying `data-node-id` and, for named layers, `data-name`; text as JSX children of `<p>`; images as `<img src={imgX}>` constants under an `assetPathPrefix` URL that expires after 7 days. Values come as Tailwind arbitrary classes with design tokens as `var(--token,fallback)`; the fallback is the design value:

```
text-[length:var(--scale\/400,16px)] leading-[22px] font-[family-name:var(--fonts\/inter\/family\/family,'Inter:Regular')]
tracking-[-0.32px] text-[color:var(--text\/primary\/default,black)] bg-[var(--surface\/page,white)]
rounded-[var(--border-radius\/large,32px)] border-[length:var(--border-width\/small,1px)] uppercase whitespace-nowrap
```

- `font-['Inter:Medium']` carries the weight in the style name; `font-[590]` is a numeric weight; `text-[0px]` marks a text with mixed styles (its spans carry the sizes) and is read as unknown.
- A trailer `These styles are contained in the design: <style name>: Font(family: …, weight: 500, lineHeight: Scale/800, letterSpacing: -2)` names the text styles with tokens, not numbers.
- Component functions inside the result (`function StatusBar(...)`) carry the main component's node ids, so instance internals match by name or text, not by id.
- **Too big:** for a large node the tool returns the sparse metadata XML instead of code, followed by "IMPORTANT: The design was too large to fit into context with get_design_context … call get_design_context on the IDs of the sublayers". The agent writes that as `metadata.xml` when none exists and reports `designContext: sparse`; the spec never treats it as code.
- The server's instructions demand the Figma plugin's design-to-code skill before this call; the `ua:design-capture` agent loads it.
- Sizes: 15–25K characters for a 440×956 frame; 110K for a listing frame.

## download_assets

Not confirmed on this build; the capture agent uses it only when `want` names `assets`, and writes under `assets/`.

## whoami

Cheap; the agent calls it first when `meta.json` has a rate limit older than 24 h to learn whether the seat changed.
