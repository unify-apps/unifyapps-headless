// What the person gives before anything reaches the tenant: the bundle identifier, the
// notification colour and the notification icon. Pure, no tenant.
import fs from 'node:fs';
import { readIhdr } from '../../../native-visual-check/scripts/lib/png.mjs';

// The bundle identifier grammar the platform checks, rule for rule. One value becomes both the
// iOS bundle id and the Android package name, so Android's stricter rules apply. It is permanent
// once an app is in a store, so every broken rule is listed, not only the first.
const MAX_LENGTH = 255;   // both stores' cap on a stored identifier
const MIN_SEGMENTS = 3;   // com.company.app: two dots is the floor both stores enforce
const STARTS_WITH_LETTER = /^[a-zA-Z]/;
const ALLOWED_CHARS = /^[a-zA-Z0-9_]*$/;

// Java keywords and literals: a package segment named one breaks the Android compile.
// Case-sensitive on purpose: `Class` and `New` are legal.
const JAVA_RESERVED_WORDS = new Set([
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const',
  'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'false', 'final', 'finally',
  'float', 'for', 'goto', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long',
  'native', 'new', 'null', 'package', 'private', 'protected', 'public', 'return', 'short', 'static',
  'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'true',
  'try', 'void', 'volatile', 'while',
]);

// Namespaces someone else owns: the store vendors refuse them at upload, com.example is the
// documentation placeholder, and the JVM refuses the java group. Matched case-insensitively.
const RESERVED_PREFIXES = ['com.apple', 'com.google', 'com.android', 'android', 'com.example', 'java',
  'javax', 'jdk', 'sun', 'com.sun', 'org.omg', 'org.w3c', 'org.xml'];

/** Every rule the identifier breaks, shape first, then owned namespaces. Empty breaks none. */
export function bundleIdIssues(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return [];
  const segments = trimmed.split('.');
  const issues = [];
  if (trimmed.length > MAX_LENGTH) issues.push({ code: 'TOO_LONG', max: MAX_LENGTH });
  if (segments.length < MIN_SEGMENTS) issues.push({ code: 'MIN_SEGMENTS', min: MIN_SEGMENTS });
  if (!segments.every((segment) => STARTS_WITH_LETTER.test(segment))) issues.push({ code: 'SEGMENT_START' });
  if (!segments.every((segment) => ALLOWED_CHARS.test(segment))) issues.push({ code: 'ALLOWED_CHARS' });
  const lowered = trimmed.toLowerCase();
  // Segment boundary: com.appleseed.app is a real domain, not com.apple.
  const prefix = RESERVED_PREFIXES.find((p) => lowered === p || lowered.startsWith(`${p}.`));
  if (prefix) issues.push({ code: 'RESERVED_PREFIX', prefix });
  const word = segments.find((segment) => JAVA_RESERVED_WORDS.has(segment));
  if (word) issues.push({ code: 'RESERVED_WORD', segment: word });
  return issues;
}

/** One plain sentence per broken rule, for the person. */
export function issueSentence(issue) {
  switch (issue.code) {
    case 'TOO_LONG': return `It is longer than ${issue.max} characters.`;
    case 'MIN_SEGMENTS': return `It needs at least ${issue.min} parts separated by dots, such as com.yourcompany.appname.`;
    case 'SEGMENT_START': return 'Every part must start with a letter.';
    case 'ALLOWED_CHARS': return 'Use only letters, numbers and underscores in each part: no hyphens or spaces.';
    case 'RESERVED_PREFIX': return `It starts with ${issue.prefix}, which belongs to someone else; use your own domain.`;
    case 'RESERVED_WORD': return `"${issue.segment}" is a Java keyword and cannot be a part.`;
    default: return 'It is not a valid bundle identifier.';
  }
}

/** A colour as the app stores it, #RRGGBB in capitals. */
export function normaliseColour(value) {
  const text = String(value ?? '').trim();
  if (/^#[0-9a-f]{3}$/iu.test(text)) {
    // Android reads three digits as another colour, so a short form is never expanded silently.
    throw new Error(`${text} has three digits; give all six, such as #D03934.`);
  }
  if (/^#[0-9a-f]{8}$/iu.test(text)) {
    return { colour: text.slice(0, 7).toUpperCase(), note: `${text} carries an opacity, which Android ignores; ${text.slice(0, 7).toUpperCase()} is used.` };
  }
  if (!/^#[0-9a-f]{6}$/iu.test(text)) throw new Error(`${text || 'That'} is not a colour. Give it as #RRGGBB, such as #D03934.`);
  return { colour: text.toUpperCase() };
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// The status-bar icon at xxxhdpi: 24 dp at 4x. Larger works; Android scales it down.
const ICON_SIZE = 96;
// PNG colour types with an alpha channel: 4 (grey + alpha) and 6 (RGBA).
const ALPHA_TYPES = new Set([4, 6]);

/** Whether a file can be the notification icon. Only a non-PNG is refused; the rest are warnings. */
export function checkIcon(file) {
  const head = Buffer.alloc(33);
  const fd = fs.openSync(file, 'r');
  try { fs.readSync(fd, head, 0, 33, 0); } finally { fs.closeSync(fd); }
  if (!head.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return { ok: false, message: 'The notification icon must be a PNG; the phone build accepts no other format.' };
  }
  const { width, height, colorType } = readIhdr(head);
  const warnings = [];
  if (width !== height) warnings.push(`It is ${width} x ${height}; a square icon (${ICON_SIZE} x ${ICON_SIZE}) is drawn without stretching.`);
  if (!ALPHA_TYPES.has(colorType)) warnings.push('It has no transparent background, so Android shows it as a solid square in the status bar.');
  return { ok: true, size: [width, height], warnings };
}
