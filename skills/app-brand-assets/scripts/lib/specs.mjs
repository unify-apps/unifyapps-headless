// What each platform file must be, and where it goes. Sizes are in pixels of a 1024 px canvas.
// The layout follows the Expo App Icon and Splash template (SDK 54): the iOS icon grid's 868 px
// keyline, the Android adaptive icon's 108 dp canvas (72 dp visible, 66 dp safe circle) and its
// square keyline, and Android 12's splash icon, whose outer third is masked to a circle.

export const CANVAS = 1024;
const DP = CANVAS / 108;                 // one dp of the Android adaptive canvas, 9.48 px

export const FIT = Object.freeze({
  // A square mark 600 px across reads at launcher size and stays inside the 868 px keyline.
  ios: { box: 600, maxRadius: 868 / 2 - 4 },
  // The template's square keyline (192 of 512): the same visual size as iOS inside the mask,
  // with the farthest pixel kept inside the 66 dp safe circle (312.9 px).
  android: { box: 384, maxRadius: 33 * DP - 4 },
  // Android 12+ shows a splash icon without a background inside a circle of 2/3 of its canvas
  // (341.3 px); iOS shows the same file whole.
  splash: { box: CANVAS, maxRadius: CANVAS / 3 - 6 },
  // A status bar icon: 24 dp with a 2 dp margin, drawn at 96 px (xxxhdpi).
  notification: { canvas: 96, box: 80, maxRadius: 46 },
});

export const ANDROID_SAFE_RADIUS = 33 * DP;       // 312.9 px
export const ANDROID_VISIBLE_RADIUS = 36 * DP;    // 341.3 px
export const SPLASH_VISIBLE_RADIUS = CANVAS / 3;  // 341.3 px

/** Splash image width in dp: the size Android 12 draws a splash icon at, so the 2/3 circle maps one to one. */
export const SPLASH_IMAGE_WIDTH = 288;

/** Scale that fits artwork of this size and farthest radius into a spec. */
export function fitScale({ width, height, radius }, spec) {
  return Math.min(spec.box / Math.max(width, height), spec.maxRadius / radius);
}

// Each file, the panel key update_app_settings writes its link to, and whether it is opaque. Only
// the iOS light icon is opaque: App Store icons carry no alpha channel. iOS draws its own dark
// backdrop behind the dark icon and tints the tinted one, so both stay transparent.
export const FILES = Object.freeze([
  { file: 'icons/ios-light.png', panel: 'brandAssets', key: 'iosLightModeLogo', opaque: true },
  { file: 'icons/ios-dark.png', panel: 'brandAssets', key: 'iosDarkModeLogo', opaque: false },
  { file: 'icons/ios-tinted.png', panel: 'brandAssets', key: 'iosTintedLogo', opaque: false },
  { file: 'icons/android-foreground.png', panel: 'brandAssets', key: 'androidForegroundLogo', opaque: false },
  { file: 'icons/android-monochrome.png', panel: 'brandAssets', key: 'androidMonochromeLogo', opaque: false },
  { file: 'icons/notification-icon.png', panel: 'brandAssets', key: 'notificationIcon', opaque: false, optional: true },
  { file: 'splash/splash-light.png', panel: 'splashScreen', key: 'image', opaque: false },
  { file: 'splash/splash-dark.png', panel: 'splashScreen', key: 'darkImage', opaque: false },
]);

export const DEFAULT_COLOURS = Object.freeze({
  iosBackground: '#FFFFFF',
  androidBackground: '#FFFFFF',
  splashBackground: '#FFFFFF',
  splashDarkBackground: '#000000',
});
