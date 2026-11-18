/** Reads and joins the pages of an application-builder `get_app_builder_knowledge` reply. Pure. */

/**
 * One page of the reply: its JSON header and the sheet blocks after it, or null
 * when the result is not a good knowledge reply. `docs[i].bodyBlock` counts the
 * header as block 0, so the body of `bodyBlock: 1` is `bodies[0]`.
 */
export function parseKnowledgePage(result) {
  if (!result || result.isError || !Array.isArray(result.content)) return null;
  let header;
  try { header = JSON.parse(result.content[0]?.text); } catch { return null; }
  if (header?.ok !== true) return null;
  return { header, bodies: result.content.slice(1) };
}

/** The sheets the tenant left out to keep the reply small, as it lists them: `{id, …}`. */
export function budgetNodes(header) {
  return header?.omitted?.budget?.nodes ?? [];
}

function unique(items, keyOf = (item) => item) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The nodes once each, less those whose sheet a token (`id@hash`) already names. */
export function stillToAsk(nodes, tokens) {
  const sent = new Set(Array.from(tokens, (token) => String(token).replace(/@[^@]*$/u, '')));
  return unique(nodes, (node) => node?.id).filter((node) => !sent.has(node?.id));
}

// The last page can list as omitted a sheet an earlier page already sent: a
// prerequisite left out on page 2 that page 1 delivered. Asking again would be waste.
function stillOmitted(omitted, tokens) {
  if (!omitted || typeof omitted !== 'object') return omitted;
  return Object.fromEntries(Object.entries(omitted).flatMap(([key, value]) => {
    if (!Array.isArray(value?.nodes)) return [[key, value]];
    const nodes = stillToAsk(value.nodes, tokens);
    return nodes.length ? [[key, { ...value, nodes }]] : [];
  }));
}

/**
 * The pages as one `tools/call` result. `omitted` comes from the last page,
 * because that page names what is still missing, less what any page sent.
 * `queued` are the budget nodes the caller had yet to ask for: they are the
 * whole `omitted.budget` list, and with none queued that key goes away.
 */
export function joinKnowledgePages(pages, queued = []) {
  const headers = pages.map((page) => page.header);
  const bodies = [];
  const docs = pages.flatMap((page) => {
    const before = bodies.length;
    bodies.push(...page.bodies);
    return (page.header.docs ?? []).map((doc) => (typeof doc.bodyBlock === 'number' ? { ...doc, bodyBlock: doc.bodyBlock + before } : doc));
  });
  const all = (key, keyOf) => (headers.some((header) => Array.isArray(header[key]))
    ? unique(headers.flatMap((header) => header[key] ?? []), keyOf)
    : undefined);
  const tokens = all('tokens');
  const { budget, ...rest } = headers.at(-1).omitted ?? {};
  const omitted = queued.length ? { ...rest, budget: { ...budget, nodes: queued } } : rest;
  // A later page is asked with `have` holding the sheets earlier pages sent, so
  // the tenant lists those under `alreadyHeld`, with a hint that `have` claimed
  // them. This reply carries their text, so only a sheet no page sent was held,
  // and a page's hint counts only while one of its own held sheets is left.
  const delivered = new Set(docs.map((doc) => doc.id));
  const alreadyHeld = all('alreadyHeld')?.filter((id) => !delivered.has(id));
  const hintStands = (one) => one.hint !== undefined && (!one.alreadyHeld?.length || one.alreadyHeld.some((id) => !delivered.has(id)));
  const header = {
    ...headers[0],
    ok: true,
    tokens,
    alreadyHeld,
    hint: headers.find(hintStands)?.hint,
    docs,
    omitted: stillOmitted(omitted, tokens ?? []),
    notFound: all('notFound', (item) => item?.node),
  };
  return { content: [{ type: 'text', text: JSON.stringify(header) }, ...bodies] };
}
