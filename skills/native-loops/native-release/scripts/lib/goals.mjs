// The builds a MOBILE app can get from chat, and every thing each one still needs.
//
// The platform's app_release `readiness` reply decides whether a build can start (`goals.<g>.ready`),
// but its blockers name one missing thing at a time. A person fixing one thing and then meeting the
// next is the confusing first run this skill exists to avoid, so the full list is worked out here
// from the same reply's facts. Pure: no files, no network.

export const GOALS = Object.freeze(['apk', 'aab', 'ipa', 'store-android', 'store-ios', 'update-android', 'update-ios']);

const ROWS = {
  apk: { label: 'Test APK (Android)', about: 'a file anyone can install on an Android phone.' },
  aab: { label: 'AAB (Android)', about: 'the file Google Play takes.' },
  ipa: { label: 'iOS build', about: 'the iOS app file, for a team that uploads it to App Store Connect itself. An iPhone cannot install it from a link: to test on iPhones, use Release to the App Store.' },
  'store-android': { label: 'Release to Google Play', about: 'builds the AAB and uploads it to Play.' },
  'store-ios': { label: 'Release to the App Store', about: 'builds the iOS app and uploads it to App Store Connect.' },
  'update-android': { label: 'Over-the-air update (Android)', about: 'sends page changes to phones that already have a store version, with no store review.' },
  'update-ios': { label: 'Over-the-air update (iOS)', about: 'sends page changes to phones that already have a store version, with no store review.' },
};

/** What each need asks of the person, in words the skill can say. */
export const NEED_WORDS = Object.freeze({
  publish: 'publish the app (a build carries the published version)',
  identity: 'the app name and bundle identifier',
  'signing-android': 'Android signing keys',
  'signing-ios': 'iOS signing keys (auto-generated through an App Store Connect account, or the team\'s own certificate and profile)',
  'connection-android': 'a Google Play account',
  'connection-ios': 'an App Store Connect account',
  'asc-app-id': 'the App Store app id',
  'store-release-android': 'an earlier Google Play release to update',
  'store-release-ios': 'an earlier App Store release to update',
  'build-running-android': 'the Android build already running to finish',
  'build-running-ios': 'the iOS build already running to finish',
});

/** The goal's name as the menu shows it, such as `Test APK (Android)`. */
export const goalLabel = (goal) => ROWS[goal]?.label ?? goal;

/** The platform a goal builds for. */
export function goalPlatform(goal) {
  return goal === 'apk' || goal === 'aab' || goal.endsWith('-android') ? 'android' : 'ios';
}

export const goalKind = (goal) => (goal.startsWith('store-') ? 'store' : goal.startsWith('update-') ? 'update' : 'file');

/** Every thing `goal` still needs, in the order the skill asks for them; empty when it can start. */
export function goalNeeds(readiness, goal) {
  const p = goalPlatform(goal);
  const kind = goalKind(goal);
  const state = readiness?.platforms?.[p] ?? {};
  const identity = readiness?.identity ?? {};
  const needs = [];
  if (state.buildRunning) needs.push(`build-running-${p}`);
  if (!readiness?.published) needs.push('publish');
  // Every build, the test APK too, needs the app name and bundle identifier, as the builder's Releases
  // tab does. Readiness always reports a name (a default one when none is saved), so the bundle id and
  // the record decide.
  const unconfigured = (readiness?.goals?.[goal]?.blockers ?? []).some((blocker) => blocker?.reason === 'unconfigured');
  if (unconfigured || !identity.bundleIdentifier?.trim()) needs.push('identity');
  if (goal === 'apk') return needs;
  if (!state.signing || state.signing === 'none') needs.push(`signing-${p}`);
  // The builder's Apple setup asks for the App Store app id before its signing keys, so every iOS
  // build asks for it, not only the upload that uses it.
  const ascAppIdNeed = p === 'ios' && kind !== 'update' && !String(state.ascAppId ?? '').trim() ? ['asc-app-id'] : [];
  if (kind === 'file') return [...needs, ...ascAppIdNeed];
  if (!state.storeAccount) needs.push(`connection-${p}`);
  needs.push(...ascAppIdNeed);
  if (kind === 'update' && state.hasStoreRelease !== true) needs.push(`store-release-${p}`);
  return needs;
}

/** One row per goal, in GOALS order: `{goal, label, about, needs}`. */
export function menu(readiness) {
  return GOALS.map((goal) => ({ goal, ...ROWS[goal], needs: goalNeeds(readiness, goal) }));
}

const hasValue = (values) => Boolean(values) && Object.values(values).some((v) => v !== undefined && v !== null && v !== '');

/** Which of the three extras the skill offers before a build are already set. */
export function extrasState({ brandAssets, splashScreen, pushConfigured }) {
  const word = (set) => (set ? 'set' : 'unset');
  return { brandAssets: word(hasValue(brandAssets)), splashScreen: word(hasValue(splashScreen)), pushNotifications: word(pushConfigured === true) };
}
