import fs from 'node:fs';
import path from 'node:path';
import { setCatalogueSource } from './versions.mjs';
import { writeCopilotFiles } from './copilot-manifest.mjs';

// Only product files belong in a release. Never copy a working tree wholesale.
const entries = [
  '.claude-plugin', '.codex-plugin', '.github/plugin', '.antigravity-plugin', '.mcp.json', 'mcp_config.json', 'agents',
  'hooks', 'skills', 'loops', 'scripts', 'opencode', 'commands', 'gemini-extension.json',
  'README.md', 'LICENSE', 'getting_started.md', 'CHANGELOG.md', 'SECURITY.md', 'package.json', 'setup.sh', 'install.sh',
];
const excluded = new Set(['.git', '.claude', '.codex', '.agents', '.unify', '.nebula', 'UnifyApps Headless', 'node_modules', '.DS_Store', 'dist', 'codex-skills']);

export function copyDistribution(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of entries) {
    const from = path.join(source, entry);
    if (!fs.existsSync(from)) throw new Error(`Release file is missing: ${entry}`);
    fs.mkdirSync(path.dirname(path.join(destination, entry)), { recursive: true });
    fs.cpSync(from, path.join(destination, entry), {
      recursive: true,
      filter(file) {
        const name = path.basename(file);
        if (excluded.has(name) || name.startsWith('.env') || name.endsWith('.log') || name.endsWith('.zip')) return false;
        if (fs.lstatSync(file).isSymbolicLink()) throw new Error(`Release files must not be symlinks: ${file}`);
        return true;
      },
    });
  }
  // A copy installs from itself: its catalogue names its own folder, not a GitHub tag.
  setCatalogueSource(destination, null);
  writeCopilotFiles(destination);
}
