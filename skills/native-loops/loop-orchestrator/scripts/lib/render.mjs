// Deterministic report rendering: a fixed template plus one JSON block. The same data
// always gives the same bytes: keys sorted, numbers normalised (3 decimals at most,
// -0 → 0, NaN and Infinity → null), no clock read anywhere.
import fs from 'node:fs';
import path from 'node:path';
import { failed } from './output.mjs';
import { TEMPLATES_DIR } from './paths.mjs';

export const DATA_TOKEN = '__LOOPS_DATA__';

export function normalise(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    const rounded = Math.round(value * 1000) / 1000;
    return Object.is(rounded, -0) ? 0 : rounded;
  }
  if (Array.isArray(value)) return value.map(normalise);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) out[key] = normalise(value[key]);
    }
    return out;
  }
  return value === undefined ? null : value;
}

/** JSON safe inside <script>: no </script>, no <!--, no line separators. */
export function stableJson(value) {
  return JSON.stringify(normalise(value))
    .replace(/</gu, '\\u003c')
    .replace(/>/gu, '\\u003e')
    .replace(/&/gu, '\\u0026')
    .replace(/\u2028/gu, '\\u2028')
    .replace(/\u2029/gu, '\\u2029');
}

export function readTemplate(name) {
  const file = path.join(TEMPLATES_DIR, name);
  const text = fs.readFileSync(file, 'utf8');
  const count = text.split(DATA_TOKEN).length - 1;
  if (count !== 1) throw failed(`template ${name} must hold ${DATA_TOKEN} exactly once (found ${count})`);
  return text;
}

/** Pure given the template text: the filled page. */
export function fill(template, data) {
  const json = stableJson(data);
  return template.replace(DATA_TOKEN, () => json);
}
