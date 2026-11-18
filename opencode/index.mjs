// The entry `opencode plugin add` loads when it installs this repository as a
// package, and the one the installer's loader re-exports.
//
// One default export serves both OpenCode versions: OpenCode 2 runs `setup`
// with its plugin context, OpenCode 1 (1.18.29 and later) runs `server` and
// takes the hooks it returns. Neither reads a named export once the default
// names an `id`, so the default is all this module exports.
import { UnifyAppsHeadless } from './plugin.mjs';
import { setup } from './v2.mjs';

export default { id: 'unifyapps-headless', setup, server: UnifyAppsHeadless };
