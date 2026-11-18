// Which platform an app runs on: MOBILE or WEB, from the manifest type in the UnifyApps Headless cache
// (`cache app <app> --json` → app.type). Every loop reads it first; it picks the device layer
// (simulators for MOBILE, browsers for WEB) and the blocks registry.json names per platform.
import { ua } from './blocks.mjs';
import { cliFailure } from './impact.mjs';
import { LoopsError, EXIT, missing, usage } from './output.mjs';

export const PLATFORMS = Object.freeze(['MOBILE', 'WEB']);
// A no-code app's pages are block config the builders write; a code app (manifest.mode `code`)
// is a React app whose source Code Builder keeps in git, built by the code app agent.
export const KINDS = Object.freeze(['no-code', 'code']);

/** Pure: a manifest type → 'MOBILE', 'WEB' or null (any other type, or none). */
export function platformOf(type) {
  const value = typeof type === 'string' ? type.trim().toUpperCase() : '';
  return PLATFORMS.includes(value) ? value : null;
}

/** Pure: a manifest mode → 'code' when it is `code`, else 'no-code'. */
export function kindOf(mode) {
  return typeof mode === 'string' && mode.trim().toLowerCase() === 'code' ? 'code' : 'no-code';
}

export function appPlatform({ appId, solution, session }) {
  if (!appId) throw usage('platform needs the app id: platform <app-id>');
  const app = ua(['cache', 'app', appId], { cwd: solution, session });
  if (app.status !== 0 || app.json?.error) throw cliFailure(app, `cache app ${appId}`);
  if (!app.json?.app) {
    throw missing(`app ${appId} is not in the cache (${app.message || app.json?.cache?.status || 'miss'}); run solution refresh, then platform again`);
  }
  const type = app.json.app.type ?? null;
  const kind = kindOf(app.json.app.mode);
  const data = { appId: app.json.app.id ?? appId, name: app.json.app.name ?? null, type, platform: platformOf(type), kind };
  if (!data.platform) {
    throw new LoopsError(`app ${data.appId} has manifest type ${type ?? 'none'}: the loops run MOBILE and WEB apps only`, { exit: EXIT.FAIL, code: 'UNSUPPORTED_PLATFORM', data });
  }
  return { data, text: `${data.name ?? '(unnamed)'} [${data.appId}]: ${data.platform}${kind === 'code' ? ' (code app)' : ''}` };
}
