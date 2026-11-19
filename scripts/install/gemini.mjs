#!/usr/bin/env node
// Writes what Gemini CLI reads when this repository is installed as an
// extension (`gemini extensions install <repo URL>`):
//
//   gemini-extension.json  the tenant MCP servers, by `${extensionPath}`
//   commands/ua/*.toml     a `/ua:<skill>` command per typed skill
//
// The files are committed, since Gemini installs straight from git; the smoke
// test fails when they no longer match. Run `node scripts/install/gemini.mjs`
// after adding a skill or a server. The session-start note that tells the
// model the plugin's folder is `scripts/gemini-session.mjs`, run from
// `hooks/hooks.json`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { firstSentence, pluginServers, resolvedCommand, typedSkills } from '../folder/agent-targets.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const GEMINI_MANIFEST = 'gemini-extension.json';
export const GEMINI_COMMANDS_DIR = path.join('commands', 'ua');

const portable = (value) => (value.startsWith(`${ROOT}${path.sep}`) ? `\${extensionPath}\${/}${path.relative(ROOT, value).split(path.sep).join('${/}')}` : value);
const tomlString = (value) => `"${String(value).replace(/\\/gu, '\\\\').replace(/"/gu, '\\"').replace(/\n/gu, ' ')}"`;

export function geminiManifest() {
  const { name, version, description } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const mcpServers = Object.fromEntries(pluginServers().map(([server, config]) => {
    const { command, args } = resolvedCommand(server, config);
    return [server, { command, args: args.map(portable) }];
  }));
  return { name, version, description, mcpServers };
}

/** `{ "<file name>": "<TOML>" }` for commands/ua. */
export function geminiCommands() {
  return Object.fromEntries(typedSkills().map((skill) => {
    const file = path.relative(ROOT, path.join(skill.dir, 'SKILL.md')).split(path.sep).join('/');
    const prompt = `Run the UnifyApps Headless \`${skill.name}\` skill: read \`${file}\` in the UnifyApps Headless folder that this session's start note names, and follow it.\n\n{{args}}`;
    return [`${skill.name}.toml`, `description = ${tomlString(firstSentence(skill.description))}\nprompt = """\n${prompt}\n"""\n`];
  }));
}

export function writeGeminiExtension(root = ROOT) {
  fs.writeFileSync(path.join(root, GEMINI_MANIFEST), `${JSON.stringify(geminiManifest(), null, 2)}\n`);
  const dir = path.join(root, GEMINI_COMMANDS_DIR);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const [file, text] of Object.entries(geminiCommands())) fs.writeFileSync(path.join(dir, file), text);
}

/** What differs between the committed files and what this would write. */
export function geminiDrift(root = ROOT) {
  const drift = [];
  const manifest = path.join(root, GEMINI_MANIFEST);
  if (!fs.existsSync(manifest) || fs.readFileSync(manifest, 'utf8') !== `${JSON.stringify(geminiManifest(), null, 2)}\n`) drift.push(GEMINI_MANIFEST);
  const dir = path.join(root, GEMINI_COMMANDS_DIR);
  const want = geminiCommands();
  const have = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  for (const [file, text] of Object.entries(want)) if (!have.includes(file) || fs.readFileSync(path.join(dir, file), 'utf8') !== text) drift.push(`${GEMINI_COMMANDS_DIR}/${file}`);
  for (const file of have) if (!(file in want)) drift.push(`${GEMINI_COMMANDS_DIR}/${file} (no such skill)`);
  return drift;
}

const entry = process.argv[1] && fs.existsSync(process.argv[1]) ? fs.realpathSync(process.argv[1]) : '';
if (entry === fs.realpathSync(fileURLToPath(import.meta.url))) {
  writeGeminiExtension();
  console.log(`Wrote ${GEMINI_MANIFEST} and ${Object.keys(geminiCommands()).length} commands in ${GEMINI_COMMANDS_DIR}.`);
}
