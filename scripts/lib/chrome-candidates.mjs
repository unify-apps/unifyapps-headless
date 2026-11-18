// Where a Chromium browser for the sign-in window may be installed, in the
// order `login.mjs` tries them. An absolute path is checked as it is; a bare
// name is looked up on PATH. Windows keeps browsers under the Program Files
// and per-user Local AppData folders, which a bare name on PATH never finds.
const MAC = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
];
const LINUX = ["google-chrome", "chromium", "chromium-browser"];
const WINDOWS = [
  "Google\\Chrome\\Application\\chrome.exe",
  "Microsoft\\Edge\\Application\\msedge.exe",
  "BraveSoftware\\Brave-Browser\\Application\\brave.exe",
];
const WINDOWS_ROOTS = ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"];

export function chromeCandidates(platform, env) {
  if (platform !== "win32") return [...MAC, ...LINUX];
  const roots = WINDOWS_ROOTS.map((name) => env[name]).filter(Boolean);
  return [
    ...WINDOWS.flatMap((browser) => roots.map((root) => `${root.replace(/\\+$/u, "")}\\${browser}`)),
    "chrome.exe",
    "msedge.exe",
  ];
}
