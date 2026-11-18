/** The knowledge tokens one builder holds, `{ "<sheetId>": "<sheetId>@<hash>" }`, and how they join its calls. Pure. */

// A builder name from the first line of its message, such as 10fcf2-app-agent-3,
// or main. Anything else was not copied from the message, so it is refused
// rather than starting a list no other call of that builder would find.
const AGENT_NAME = /^[a-z0-9-]{1,80}$/u;
const TOKEN = /^\S+@[0-9a-f]+$/u;

export const isAgentName = (value) => typeof value === 'string' && AGENT_NAME.test(value);

/** `blocks/table@ed35de` → `blocks/table`. */
export const sheetOf = (token) => token.slice(0, token.lastIndexOf('@'));

/** The list with each token under its sheet id; a later token for a sheet replaces the earlier one (a deploy changed the sheet). */
export function addTokens(list, tokens) {
  const next = { ...list };
  for (const token of tokens) if (typeof token === 'string' && TOKEN.test(token)) next[sheetOf(token)] = token;
  return next;
}

// The call's own tokens under `key`, then the list's, once each.
function withList(args, key, list) {
  const own = args[key] ?? [];
  if (!Array.isArray(own)) return args;
  const tokens = [...new Set([...own, ...Object.values(list)])];
  return tokens.length ? { ...args, [key]: tokens } : args;
}

/**
 * A knowledge read's `have` plus the list, and `[]` when both are empty: the
 * tenant requires `have`. Only `have: []` stays as sent: the caller wants the
 * sheets' text again.
 */
export function withHave(args, list) {
  if (Array.isArray(args.have) && !args.have.length) return args;
  const sent = withList(args, 'have', list);
  return sent.have === undefined ? { ...sent, have: [] } : sent;
}

/** A write's own `knowledgeTokens` plus the list. */
export const withKnowledgeTokens = (args, list) => withList(args, 'knowledgeTokens', list);

/** The tokens a reply hands over: a knowledge read's `tokens`, or the `sheets.tokens` of a refused write that carries the sheets it wants read. */
export function replyTokens(result) {
  let header;
  try { header = JSON.parse(result?.content?.[0]?.text); } catch { return []; }
  return [header?.tokens, header?.sheets?.tokens].flatMap((tokens) => (Array.isArray(tokens) ? tokens : []));
}

// The tenant's refusal tells the caller to put the tokens on `knowledgeTokens`
// itself. Through the bridge that is wrong: the bridge keeps the tokens a
// refusal hands over and adds them to the write, so the same call sent again
// is the whole fix. These are the tenant's wordings, one for a step and one for
// a batch. The batch wording later added "— or, when your `knowledgeTokens`
// field says tokens are added for you, write none and send the same write
// unchanged"; both the older and the newer one are matched.
const TOKEN_ADVICE = [
  /Then send the write again with those tokens:[\s\S]*?Tokens you already hold from an earlier call are still good; send them too\./gu,
  /Send every token in `sheets\.tokens` on this call's top-level knowledgeTokens, which covers every step, and retry the whole batch(?: — or, when your `knowledgeTokens` field says tokens are added for you, write none and send the same write unchanged)?\./gu,
];
const SAME_CALL = 'Then send the same call again, unchanged: the bridge has put those tokens on your list and adds them to the write. Do not add knowledgeTokens yourself.';

/** A refused write that carried `sheets.tokens`, with its advice to send `knowledgeTokens` replaced by: send the same call again. */
export function withSameCallAdvice(result) {
  let header;
  try { header = JSON.parse(result?.content?.[0]?.text); } catch { return result; }
  if (!Array.isArray(header?.sheets?.tokens) || !header.sheets.tokens.length) return result;
  let replaced = false;
  const rewritten = JSON.parse(JSON.stringify(header), (_key, value) => {
    if (typeof value !== 'string') return value;
    const next = TOKEN_ADVICE.reduce((text, advice) => text.replace(advice, SAME_CALL), value);
    if (next !== value) replaced = true;
    return next;
  });
  const text = JSON.stringify(replaced ? rewritten : { ...header, bridge: SAME_CALL });
  return { ...result, content: [{ ...result.content[0], text }, ...result.content.slice(1)] };
}

/** The line a refused write gets when the bridge kept no list for its builder: the bridge started again since that builder's reads, or the builder never read. */
export const restartedLine = (agent) => `The bridge holds no knowledge read for agent "${agent}": it started again since your reads (a plugin update or a restart empties its list), or you have not read a sheet yet. `
  + `Read the sheets this refusal names again with get_app_builder_knowledge, agent "${agent}" and have: [], then send the same call again.`;

/**
 * A refused write of a builder the bridge kept no list for, with `restartedLine`
 * added as `bridge`. A refusal that carries `sheets.tokens` already brings the
 * sheets and their tokens, so it is left to `withSameCallAdvice`.
 */
export function withRestartedNote(result, agent) {
  let header;
  try { header = JSON.parse(result?.content?.[0]?.text); } catch { return result; }
  const isRefused = result?.isError === true || header?.ok === false;
  if (!isRefused || !header || typeof header !== 'object' || Array.isArray(header?.sheets?.tokens) && header.sheets.tokens.length) return result;
  const text = JSON.stringify({ ...header, bridge: restartedLine(agent) });
  return { ...result, content: [{ ...result.content[0], text }, ...result.content.slice(1)] };
}

/**
 * A `have: []` read arrived for an agent name whose list the bridge already
 * held non-empty. That is the documented restart contract working as it
 * should when it is the same builder reading again after its context was
 * summarised, and the list is wiped as always (see the call site: a stale
 * sheet must never pass the knowledge gate). But the exact same shape also
 * arises when a second builder was dispatched under the identical literal
 * name and has just discarded sheets the first one still holds. The bridge
 * cannot tell the two apart, so this names the possibility rather than
 * leaving it invisible.
 */
export function withCollisionNote(result, agent) {
  let header;
  try { header = JSON.parse(result?.content?.[0]?.text); } catch { return result; }
  if (!header || typeof header !== 'object') return result;
  const note = `This bridge already held a knowledge list for agent "${agent}" when this have: [] read arrived, and has restarted it as always. If another builder is also using the exact name "${agent}", its held sheets were just discarded: give each builder its own name (such as "${agent}-<entity-slug>") and read again.`;
  const text = JSON.stringify({ ...header, bridge: header.bridge ? `${header.bridge} ${note}` : note });
  return { ...result, content: [{ ...result.content[0], text }, ...result.content.slice(1)] };
}
