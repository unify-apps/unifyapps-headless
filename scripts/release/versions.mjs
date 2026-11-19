// The version lives in several manifests, one per agent, and they must agree:
// each agent reads its own file, and an install or update compares that file's
// version. The publish workflow is the only writer (`setVersion`); the smoke
// test fails when they disagree (`readVersions`).
import fs from 'node:fs';
import path from 'node:path';

export const REPO = 'unify-apps/unifyapps-headless';
export const REPO_GIT_URL = `https://github.com/${REPO}.git`;

/** Every file that carries the version, and where in it. */
export const VERSION_FILES = ['package.json', '.claude-plugin/plugin.json', 'gemini-extension.json', '.codex-plugin/plugin.json', '.github/plugin/plugin.json'];

const MARKETPLACE = '.claude-plugin/marketplace.json';
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/u;

const readJson = (root, file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const writeJson = (root, file, value) => fs.writeFileSync(path.join(root, file), `${JSON.stringify(value, null, 2)}\n`);

export function parseVersion(text) {
  const match = SEMVER.exec(String(text ?? '').replace(/^v/u, ''));
  if (!match) return null;
  return { major: +match[1], minor: +match[2], patch: +match[3], pre: match[4] ?? null };
}

/** Semver order, prereleases before their release (0.0.6-beta.1 < 0.0.6). */
export function compareVersions(a, b) {
  const x = parseVersion(a), y = parseVersion(b);
  if (!x || !y) throw new Error(`Not a version: ${!x ? a : b}`);
  for (const key of ['major', 'minor', 'patch']) if (x[key] !== y[key]) return x[key] - y[key];
  if (x.pre === y.pre) return 0;
  if (x.pre === null) return 1;
  if (y.pre === null) return -1;
  const left = x.pre.split('.'), right = y.pre.split('.');
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    if (left[i] === undefined) return -1;
    if (right[i] === undefined) return 1;
    const numeric = /^\d+$/u.test(left[i]) && /^\d+$/u.test(right[i]);
    const diff = numeric ? +left[i] - +right[i] : left[i].localeCompare(right[i]);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** { file: version } for every version file that exists. */
export function readVersions(root) {
  return Object.fromEntries(VERSION_FILES.filter((file) => fs.existsSync(path.join(root, file)))
    .map((file) => [file, readJson(root, file).version]));
}

export function setVersion(root, version) {
  if (!parseVersion(version)) throw new Error(`Not a version: ${version}`);
  for (const file of VERSION_FILES) {
    if (!fs.existsSync(path.join(root, file))) continue;
    writeJson(root, file, { ...readJson(root, file), version });
  }
}

/** The catalogue entry that Claude Code, Copilot and Codex install `ua` from. */
export function catalogueSource(root) {
  return readJson(root, MARKETPLACE).plugins.find((plugin) => plugin.name === 'ua')?.source;
}

/**
 * Points the catalogue at one release tag, or at the folder it sits in when
 * `tag` is null. A git `url` source with a `ref`, because Codex skips a
 * `github` source and Claude Code and Copilot read a `url` one the same way.
 */
export function setCatalogueSource(root, tag) {
  const catalogue = readJson(root, MARKETPLACE);
  catalogue.plugins = catalogue.plugins.map((plugin) => (plugin.name !== 'ua' ? plugin : {
    ...plugin, source: tag ? { source: 'url', url: REPO_GIT_URL, ref: tag } : './',
  }));
  writeJson(root, MARKETPLACE, catalogue);
}
