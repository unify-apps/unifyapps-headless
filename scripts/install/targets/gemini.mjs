// Gemini CLI: installed as a Gemini extension from the staged copy, which holds
// `gemini-extension.json` and `commands/ua/*.toml` (see scripts/install/gemini.mjs).
// Gemini copies the extension into its own folder, so a reinstall removes the
// old copy first.
import { run, versionOf, which } from '../util.mjs';

const NAME = 'unifyapps-headless';
const gemini = () => which('gemini');

export default {
  id: 'gemini',
  label: 'Gemini CLI',

  detect() {
    const bin = gemini();
    if (!bin) return { found: false, note: 'not found' };
    const version = versionOf(bin);
    return version ? { found: true, version } : { found: false, note: 'found but it cannot run' };
  },

  install({ pluginRoot }) {
    const bin = gemini();
    try { run(bin, ['extensions', 'uninstall', NAME]); } catch { /* not installed */ }
    // Gemini asks to trust a local folder even with --consent; the person chose Gemini in the installer.
    run(bin, ['extensions', 'install', pluginRoot, '--consent'], { input: 'y\n' });
    return {
      start: 'Start a new Gemini session (`gemini`) in your folder, trust the folder when asked, and type /ua:setup.',
      notes: ['Gemini has no UnifyApps Headless builders: the main session does their work.'],
    };
  },

  uninstall() {
    const bin = gemini();
    if (bin) try { run(bin, ['extensions', 'uninstall', NAME]); } catch { /* not installed */ }
  },
};
