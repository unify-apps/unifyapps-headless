// UnifyApps Headless is tuned for Opus 5.5 at medium effort. A stronger model
// or a higher effort spends more time and context on the same builds, so the
// SessionStart hook says so once. Advice only: nothing is ever refused here.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ABOVE_MEDIUM = new Set(['high', 'xhigh', 'max']);
const FAMILY = /(fable|opus|sonnet|haiku)(?:-(\d+)(?:-(\d{1,2}))?)?/u;

// `claude-opus-5-5[1m]`, `us.anthropic.claude-opus-5-5-v1:0` and `opus` all name the same model.
export function modelKey(model) {
  return String(model ?? '').toLowerCase().replace(/\[[^\]]*\]$/u, '').replace(/^.*\.(?=claude-)/u, '').replace(/-v\d+(?::\d+)?$/u, '').trim();
}

export function modelLabel(model) {
  const match = FAMILY.exec(modelKey(model));
  if (!match) return String(model);
  const name = match[1][0].toUpperCase() + match[1].slice(1);
  return match[2] ? `${name} ${match[2]}${match[3] ? `.${match[3]}` : ''}` : name;
}

const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };

// Claude Code exports the live effort to hooks; settings are the fallback,
// the folder's own before the person's, a model's own level before the global one.
export function effortFor(model, { env = process.env, cwd = process.cwd(), home = os.homedir() } = {}) {
  const live = env.CLAUDE_EFFORT || env.CLAUDE_CODE_EFFORT_LEVEL;
  if (live) return String(live).toLowerCase();
  const key = modelKey(model);
  const settings = [path.join(cwd, '.claude', 'settings.local.json'), path.join(cwd, '.claude', 'settings.json'), path.join(home, '.claude', 'settings.json')]
    .map(readJson).filter(Boolean);
  const level = settings.map(s => s.modelSettings?.[key]?.effortLevel).find(Boolean) ?? settings.map(s => s.effortLevel).find(Boolean);
  return typeof level === 'string' ? level.toLowerCase() : null;
}

export function modelFitNotice(model, effort) {
  const family = FAMILY.exec(modelKey(model))?.[1];
  const tooStrong = family === 'fable' || (family === 'opus' && ABOVE_MEDIUM.has(effort));
  if (!tooStrong) return null;
  const running = effort ? `${modelLabel(model)} at ${effort} effort` : modelLabel(model);
  return `This session runs ${running}. UnifyApps Headless is tuned for Opus 5.5 at medium effort: `
    + 'a stronger model or a higher effort takes longer and uses more context, with no better builds. '
    + 'Run /model, choose Opus 5.5 and set effort to medium.';
}
