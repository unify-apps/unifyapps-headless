// Redaction for run log events. Builds on UnifyApps Headless's redactor (scripts/lib/redact-secrets.mjs:
// passwords, tokens, keys, Bearer and Basic values, cookies, _at, JWTs, cloud keys) and adds
// what the loops see: the _rt refresh cookie, OTPs and PINs typed into a device, and every
// literal listed in LOOPS_HOME/secrets.redact (one per line, # comments; 4 characters or more).
import fs from 'node:fs';
import path from 'node:path';
import { REDACTED, redactSecrets } from '../../../../../scripts/lib/redact-secrets.mjs';

export { REDACTED };

const SECRET_KEY = /^(?:password|passwd|pwd|secret|token|access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|authorization|cookie|set-cookie|_at|_rt|otp|pin|passcode|client[_-]?secret|private[_-]?key)$/iu;

const EXTRA_RULES = [
  [/(\b_rt\\*"?\s*:\s*\\*")[^"\\\r\n;]+/gu, (_, head) => head + REDACTED],
  [/(\b_rt=)[^;\s"\\&]+/gu, (_, head) => head + REDACTED],
  [/(\b(?:otp|pin|passcode)\s*[:=]\s*)\d{4,8}\b/giu, (_, head) => head + REDACTED],
];

export function loadSecretList(home) {
  if (!home) return [];
  try {
    return fs.readFileSync(path.join(home, 'secrets.redact'), 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.length >= 4)
      .sort((left, right) => right.length - left.length);
  } catch {
    return [];
  }
}

export function redactText(text, secrets = []) {
  let out = redactSecrets(String(text));
  for (const [pattern, replace] of EXTRA_RULES) out = out.replace(pattern, replace);
  for (const secret of secrets) out = out.split(secret).join(REDACTED);
  return out;
}

/** Every string in a value, and every value under a secret-named key. */
export function redactValue(value, secrets = [], key = null) {
  if (key && SECRET_KEY.test(key) && value != null && typeof value !== 'object') return REDACTED;
  if (typeof value === 'string') return redactText(value, secrets);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, secrets));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [name, item] of Object.entries(value)) out[name] = redactValue(item, secrets, name);
    return out;
  }
  return value;
}
