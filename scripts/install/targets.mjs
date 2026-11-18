// The coding agents UnifyApps Headless installs into. To support another agent,
// add a file in `targets/` with the same shape and list it here:
//
//   id            short name, used by --agents
//   label         what the person reads
//   detect()      { found, version?, note? }: whether the agent is on this machine
//   install(ctx)  ctx = { pluginRoot, version }; returns { start, notes }
//   uninstall(ctx)
//
// The installer adds the plugin to agents already installed; it never installs an agent.
import claude from './targets/claude.mjs';
import codex from './targets/codex.mjs';
import copilot from './targets/copilot.mjs';
import gemini from './targets/gemini.mjs';
import opencode from './targets/opencode.mjs';

export const TARGETS = Object.freeze([claude, codex, opencode, gemini, copilot]);
