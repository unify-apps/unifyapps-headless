/** Masks secrets in transcript text before it leaves the machine. Pure: text in,
 * text out. Every pattern also matches inside a JSON string, where quotes arrive
 * escaped as `\"`, because transcripts are JSON lines that quote tool output. */
export const REDACTED = '[REDACTED]';

const Q = '\\\\*"?'; // an optional quote, escaped any number of times
const VALUE = '[^"\\\\\\r\\n;]+';

// A key that names a secret, alone or as the last word of a longer name
// (access_token, x-api-key, accessToken). Only the keyword is matched, never the
// name before it, so a long name cannot make the match backtrack. A letter right
// after the keyword (tokens, tokenCount) means it is a different word.
function secretKeyRule(keyword, flags) {
  // `=` that is part of ==, ===, =>, !=, <= or >= is a comparison, not an assignment.
  const sep = `(?<![=!<>])(?::|=(?![=>]))`;
  // Double-quoted: plain JSON with its escapes, then JSON inside a JSON string,
  // then deeper nesting, where an escaped quote inside the value is not followed.
  const plain = `"((?:[^"\\\\\\r\\n]|\\\\[^\\r\\n])+)`;
  const nested = `\\\\"((?:\\\\{4}|\\\\{3}"|\\\\{2}[^\\\\"\\r\\n]|\\\\[^\\\\"\\r\\n]|[^"\\\\\\r\\n])+)`;
  const deeper = `\\\\{2,}"([^"\\\\\\r\\n]+)`;
  const single = `'([^'\\\\\\r\\n]+)`;
  // A bare word that is a keyword, a type, a dotted path, an indexed name, an expression or a call is code.
  const code = `(?:true|false|null|undefined|None|nil|string|number|boolean|any|object|str|int)(?![\\w$])`
    + `|(?:await|new|typeof)\\b|[$({\\[]|[A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)+(?![\\w$-])|[A-Za-z_$][\\w$.]*\\[['"]|[\\w.]*\\(`;
  const bare = `(?!${code})([^\\s"'\\\\,;&]+)`;
  return new RegExp(`(${keyword}${Q}\\s*${sep}\\s*)(?:${plain}|${nested}|${deeper}|${single}|${bare})`, flags);
}

function maskSecretValue(match, head, plain, nested, deeper, single) {
  const value = plain ?? nested ?? deeper ?? single;
  if (value === undefined) return head + REDACTED;
  const rest = match.slice(head.length);
  return head + rest.slice(0, rest.length - value.length) + REDACTED;
}

// A pasted cookie string (`_at=…; __Host-proxy=…; sub=…`): when one pair in a
// `;` chain is a session cookie, every value in the chain is masked, since an
// access proxy splits its session over cookies with plain names too.
// A chain starts only where no value can be running, so a long word is scanned once, not once per '/' or ':' in it.
const COOKIE_CHAIN = /(?<![^;\s"'\\&|])[\w.-]+=[^;\s"'\\&|]+(?:;[ \t]*[\w.-]+=[^;\s"'\\&|]+)+/gu;
const SESSION_PAIR = /(?:^|;[ \t]*)(?:_at|__(?:Host|Secure)-[\w.-]+)=/u;
const maskCookieChain = (chain) => (SESSION_PAIR.test(chain)
  ? chain.replace(/(?<![\w.-])([\w.-]+=)[^;\s]+/gu, (_, head) => head + REDACTED)
  : chain);

const RULES = [
  [COOKIE_CHAIN, maskCookieChain],
  // A key with no end stops at the next key's start, so many of them cannot each walk the whole text.
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----(?:(?!-----BEGIN [A-Z ]*PRIVATE KEY-----)[\s\S])*?-----END [A-Z ]*PRIVATE KEY-----/gu, () => REDACTED],
  [/\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gu, () => REDACTED],
  [new RegExp(`(\\b(?:set-)?cookie${Q}\\s*[:=]\\s*${Q})(?=[\\w.-]+=)[^"\\\\\\r\\n]+`, 'giu'), (_, head) => head + REDACTED],
  // Basic and Bearer carry one value, so the words after it survive. Any other
  // scheme (Digest, AWS4-HMAC-SHA256, ...) spreads secrets over the whole value.
  [new RegExp(`(\\bauthorization${Q}\\s*[:=]\\s*${Q}(?:Basic|Bearer)\\s+)[^\\s"\\\\,;]+`, 'giu'), (_, head) => head + REDACTED],
  // A quoted value ends at its quote. A bare one runs to the end of the line: inside
  // a JSON string that is an escaped `\n`, or a quote that JSON syntax follows. A key whose
  // value is an object or a list (a schema property named Authorization) holds no secret itself:
  // its own keys are masked by name, and eating its `{` broke the JSON around it.
  [new RegExp(`(\\bauthorization${Q}\\s*[:=]\\s*\\\\*")(?!(?:Basic|Bearer)\\s)[^"\\\\\\r\\n]+`, 'giu'), (_, head) => head + REDACTED],
  [new RegExp(`(\\bauthorization${Q}\\s*[:=]\\s*)(?![\\s"\\\\{\\[])(?!(?:Basic|Bearer)\\s)(?:[^"\\\\\\r\\n]|"(?!\\s*(?:[,:]\\s*"|[}\\]]))|\\\\[^nr\\r\\n])+`, 'giu'), (_, head) => head + REDACTED],
  // private_key and privateKey hold a key that is not always a PEM block (a JWT signing key can be
  // bare base64), so the name masks it too.
  [secretKeyRule(`(?<![A-Za-z0-9])(?:password|passwd|secret|token|api[_-]?key|private[_-]?key)`, 'giu'), maskSecretValue],
  [secretKeyRule(`(?<=[a-z0-9])(?:Password|Passwd|Secret|Token|Api[_-]?Key|Private[_-]?Key)`, 'gu'), maskSecretValue],
  [/\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gu, (_, head) => head + REDACTED],
  [new RegExp(`(\\b_at${Q}\\s*:\\s*\\\\*")${VALUE}`, 'gu'), (_, head) => head + REDACTED],
  [/(\b_at=)[^;\s"\\&]+/gu, (_, head) => head + REDACTED],
  // A `__Host-` or `__Secure-` cookie is a session by convention (an access
  // proxy's own, say), pasted the same way as `_at`.
  [/((?<![\w-])__(?:Host|Secure)-[\w.-]+=)[^;\s"'\\&]+/gu, (_, head) => head + REDACTED],
  // A platform session cookie value on its own, as a person pastes it in chat
  // ("the cookie is 147_<uuid>_01"), with no key in front of it.
  [/\b\d{1,6}_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_\d{1,4}\b/giu, () => REDACTED],
  [/\bsk-(?:ant-)?[A-Za-z0-9_-]{16,}/gu, () => REDACTED],
  [/\bAKIA[0-9A-Z]{16}\b/gu, () => REDACTED],
  [/\b(?:gh[pos]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})/gu, () => REDACTED],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/gu, () => REDACTED],
  [/\bAIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])/gu, () => REDACTED],
];

export function redactSecrets(text) {
  let out = String(text ?? '');
  for (const [pattern, replace] of RULES) out = out.replace(pattern, replace);
  return out;
}
