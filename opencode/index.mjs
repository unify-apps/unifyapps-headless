// The entry `opencode plugin` loads when it installs this repository as a
// package. OpenCode calls every function a plugin module exports, so this
// exports the plugin alone.
export { UnifyAppsHeadless } from './plugin.mjs';
