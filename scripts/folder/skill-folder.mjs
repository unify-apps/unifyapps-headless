// A skill folder on disk, read for publishing: SKILL.md and every file beside it.
//
// The folder is what `skill publish` sends to the tenant, where it is loaded
// into other people's sessions as instructions and run as scripts. So nothing
// leaves without passing every check here first: a name the platform and
// Claude Code both accept, text files only, no secret, and no line
// `lib/skill-scan.mjs` reads as a planted instruction.
import fs from 'node:fs';
import path from 'node:path';
import { UaError } from '../lib/contracts.mjs';
import { redactSecrets } from '../lib/redact-secrets.mjs';
import { scanFetchedSkill } from '../lib/skill-scan.mjs';

// Claude Code's own limit for a skill name, and the shape every skill folder here has.
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const NAME_MAX = 64;
const DESCRIPTION_MAX = 1024;
// The agent-builder `upload_file` takes up to 20 MB; a loop's scripts and
// references are a few KB each, so a much smaller ceiling catches a build
// output or a dataset copied in by mistake.
export const FILE_MAX_BYTES = 1_000_000;
export const FILES_MAX = 40;
// Written by a fetch, never published back.
const SKIPPED = new Set(['SKILL.md', 'skill.json']);

const CONTENT_TYPES = {
  '.md': 'text/markdown', '.txt': 'text/plain', '.json': 'application/json', '.yaml': 'application/yaml', '.yml': 'application/yaml',
  '.csv': 'text/csv', '.mjs': 'text/javascript', '.js': 'text/javascript', '.ts': 'text/plain', '.sh': 'text/x-shellscript',
  '.py': 'text/x-python', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.sql': 'text/plain',
};
export const contentTypeFor = (file) => CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'text/plain';

const refuse = (message) => { throw new UaError('USAGE', message); };

/** The frontmatter fields a published skill needs, or a refusal naming what is missing. */
export function skillFrontmatter(text) {
  const head = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(text)?.[1];
  if (!head) refuse('SKILL.md must start with frontmatter between --- lines.');
  const field = (key) => {
    const raw = new RegExp(`^${key}:[ \\t]*(.*)$`, 'mu').exec(head)?.[1]?.trim() ?? '';
    return raw.replace(/^(['"])([\s\S]*)\1$/u, '$2').trim();
  };
  const name = field('name');
  const description = field('description');
  if (!NAME.test(name) || name.length > NAME_MAX) refuse(`SKILL.md name must be lowercase words joined by hyphens, at most ${NAME_MAX} characters: ${JSON.stringify(name)}.`);
  if (!description) refuse('SKILL.md needs a one-line description: it is how Claude decides when to load the skill.');
  if (description.length > DESCRIPTION_MAX) refuse(`SKILL.md description is ${description.length} characters, over ${DESCRIPTION_MAX}.`);
  return { name, description };
}

function walk(root, dir = root, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    const relativePath = path.relative(root, full).split(path.sep).join('/');
    if (entry.isSymbolicLink()) refuse(`${relativePath} is a symbolic link. Copy the file into the folder instead.`);
    // A fetch writes tools/ itself and refuses an attached file there.
    if (entry.isDirectory() && dir === root && entry.name === 'tools') refuse('A skill folder cannot hold a tools/ folder. Put scripts in scripts/.');
    if (entry.isDirectory()) walk(root, full, out);
    else if (entry.isFile() && !SKIPPED.has(relativePath)) out.push({ full, relativePath });
  }
  return out;
}

// A NUL byte, or bytes that do not survive a UTF-8 round trip, mean a binary file.
const isText = (bytes) => !bytes.includes(0) && Buffer.from(bytes.toString('utf8'), 'utf8').equals(bytes);

/**
 * Reads `dir` as a skill to publish. Throws USAGE naming the first problem, so
 * nothing is sent until the whole folder is right.
 *
 * Returns `{ name, description, body, files }`; each file is
 * `{ relativePath, text, size, contentType }`.
 */
export function readSkillFolder(dir) {
  const root = path.resolve(String(dir ?? ''));
  if (!dir || !fs.existsSync(path.join(root, 'SKILL.md'))) refuse(`No SKILL.md in ${root}.`);
  const body = fs.readFileSync(path.join(root, 'SKILL.md'), 'utf8');
  const { name, description } = skillFrontmatter(body);
  const found = walk(root);
  if (found.length > FILES_MAX) refuse(`The folder holds ${found.length} files besides SKILL.md, over ${FILES_MAX}. Keep only what the skill uses.`);
  const files = found.map(({ full, relativePath }) => {
    const bytes = fs.readFileSync(full);
    if (bytes.length > FILE_MAX_BYTES) refuse(`${relativePath} is ${bytes.length} bytes, over ${FILE_MAX_BYTES}. Keep only what the skill uses.`);
    if (!isText(bytes)) refuse(`${relativePath} is not a text file. A published skill holds text files only.`);
    return { relativePath, text: bytes.toString('utf8'), size: bytes.length, contentType: contentTypeFor(relativePath) };
  }).sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  const secrets = [['SKILL.md', body], ...files.map((file) => [file.relativePath, file.text])]
    .filter(([, text]) => redactSecrets(text) !== text).map(([file]) => file);
  if (secrets.length) throw new UaError('USAGE', `${secrets.join(', ')} ${secrets.length === 1 ? 'holds' : 'hold'} a secret (a token, key, password or cookie). Replace it with an input the person gives when the skill runs.`, { files: secrets });
  const findings = scanFetchedSkill({ skill: { properties: { skill: body } }, files });
  if (findings.length) {
    throw new UaError('USAGE', `The skill holds lines that read as instructions planted for an agent: ${findings.map((f) => `${f.file}:${f.line} ${f.rule}`).join('; ')}. Rewrite them.`, { findings });
  }
  return { name, description, body, files };
}
