#!/usr/bin/env node
// The file changes of one release, run by .github/workflows/publish.yml; the
// workflow does the git and GitHub steps around it.
//
//   node scripts/release/publish.mjs prepare --channel stable|beta [--force]
//        [--message "<one line>"] [--previous-min <version>] [--dry-run]
//
// It picks the next version from the tags (stable: the next patch; beta: that
// patch's next -beta.N), writes it into every manifest, points the catalogue
// at the new tag, rewrites the Codex manifest, names the CHANGELOG's
// "Unreleased" section after the version (stable only), and writes
// dist/release.json and dist/notes.md. It prints { version, tag, prerelease }.
//
// minRequiredVersion is this version when --force is given, else the previous
// release's, so a normal release never lifts a forced one.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareVersions, parseVersion, readVersions, setCatalogueSource, setVersion } from './versions.mjs';
import { writeCodexManifest } from './codex-manifest.mjs';
import { writeCopilotFiles } from './copilot-manifest.mjs';
import { writeAntigravityFiles } from './antigravity-manifest.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

export function nextVersion({ channel, tags, current }) {
  const stable = tags.map((tag) => tag.replace(/^v/u, '')).filter((v) => parseVersion(v) && !parseVersion(v).pre);
  const base = [current.replace(/-.*$/u, ''), ...stable].sort(compareVersions).pop();
  const { major, minor, patch } = parseVersion(base);
  const next = `${major}.${minor}.${patch + 1}`;
  if (channel === 'stable') return next;
  const betas = tags.map((tag) => new RegExp(`^v${next.replaceAll('.', '\\.')}-beta\\.(\\d+)$`, 'u').exec(tag)?.[1]).filter(Boolean).map(Number);
  return `${next}-beta.${Math.max(0, ...betas) + 1}`;
}

/** The CHANGELOG's "## Unreleased" section, renamed to the version. Returns its text, for the release notes. */
export function nameUnreleased(text, version) {
  const match = /^## Unreleased\n([\s\S]*?)(?=^## |(?![\s\S]))/mu.exec(text);
  if (!match) return { text: text.replace(/^(# Changelog\n\n[^\n]*\n)/u, `$1\n## ${version}\n\nMaintenance release.\n`), notes: 'Maintenance release.' };
  return { text: text.replace(/^## Unreleased$/mu, `## ${version}`), notes: match[1].trim() };
}

function args(argv) {
  const out = { channel: 'stable', force: false, message: '', previousMin: '0.0.0', dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--force') out.force = true;
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--channel') out.channel = argv[++i];
    else if (arg === '--message') out.message = argv[++i] ?? '';
    else if (arg === '--previous-min') out.previousMin = argv[++i] || '0.0.0';
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!['stable', 'beta'].includes(out.channel)) throw new Error('--channel is stable or beta.');
  if (out.force && out.channel !== 'stable') throw new Error('Only a stable release can force an update: a beta is never the Latest release.');
  if (!parseVersion(out.previousMin)) throw new Error(`--previous-min is not a version: ${out.previousMin}`);
  return out;
}

export function prepare(root, options, tags = execFileSync('git', ['tag', '-l', 'v*'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean)) {
  const current = readVersions(root)['package.json'];
  const version = nextVersion({ channel: options.channel, tags, current });
  const tag = `v${version}`;
  const prerelease = options.channel === 'beta';
  const minRequiredVersion = options.force ? version : options.previousMin;
  const release = { version, minRequiredVersion, ...(options.message ? { message: options.message } : {}) };
  let notes = prerelease ? `Beta of ${version.replace(/-.*$/u, '')}. Install it only to test it.` : 'Maintenance release.';
  if (!options.dryRun) {
    setVersion(root, version);
    setCatalogueSource(root, tag);
    writeCodexManifest(root);
    writeCopilotFiles(root);
    writeAntigravityFiles(root);
    // Antigravity installs a tag by URL, so the README names the newest one.
    if (!prerelease) {
      const readme = path.join(root, 'README.md');
      fs.writeFileSync(readme, fs.readFileSync(readme, 'utf8').replace(/(unifyapps-headless\/tree\/)v\d+\.\d+\.\d+(?![-\w.])/gu, `$1${tag}`));
    }
    if (!prerelease) {
      const changelog = path.join(root, 'CHANGELOG.md');
      const named = nameUnreleased(fs.readFileSync(changelog, 'utf8'), version);
      fs.writeFileSync(changelog, named.text);
      notes = named.notes;
    }
    if (options.force) notes = `**Required update.** Copies older than ${version} stop calling the tenant until they update.${options.message ? ` ${options.message}` : ''}\n\n${notes}`;
    fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(root, 'dist', 'release.json'), `${JSON.stringify(release, null, 2)}\n`);
    fs.writeFileSync(path.join(root, 'dist', 'notes.md'), `${notes}\n`);
  }
  return { version, tag, prerelease, release };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2);
  if (command !== 'prepare') { console.error('Usage: publish.mjs prepare --channel stable|beta [--force] [--message "..."] [--previous-min <version>] [--dry-run]'); process.exit(2); }
  try { console.log(JSON.stringify(prepare(ROOT, args(rest)))); }
  catch (error) { console.error(error.message); process.exit(1); }
}
