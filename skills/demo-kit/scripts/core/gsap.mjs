// GSAP, the animation library a story's scenes may draw with, kept in the kit's home rather than shipped with it:
// `doctor --fix` fetches the one pinned release from npm and checks it against npm's own checksum. A page carries it
// only when one of its scenes uses it, and the runtime plays it from the film clock, never the wall clock.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { HOME, run } from './util.mjs';

export const GSAP = {
  version: '3.13.0',
  tarball: 'https://registry.npmjs.org/gsap/-/gsap-3.13.0.tgz',
  integrity: 'sha512-QL7MJ2WMjm1PHWsoFrAQH/J8wUeqZvMtHO58qdekHpCfhvhSL4gSiz6vJf5EeMP0LOn3ZCprL2ki/gjED8ghVw==',
  // the core first, then the plugins the runtime registers
  files: ['gsap.min.js', 'CustomEase.min.js', 'DrawSVGPlugin.min.js', 'MotionPathPlugin.min.js', 'MorphSVGPlugin.min.js', 'SplitText.min.js', 'ScrambleTextPlugin.min.js', 'TextPlugin.min.js', 'Physics2DPlugin.min.js'],
};

export const gsapDir = () => path.join(HOME, 'gsap', GSAP.version);
export const gsapReady = () => GSAP.files.every((f) => fs.existsSync(path.join(gsapDir(), f)));

/** Fetches the pinned release into the kit's home and keeps only its browser builds. */
export async function installGsap() {
  if (gsapReady()) return gsapDir();
  const res = await fetch(GSAP.tarball, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`could not download GSAP ${GSAP.version}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const got = `sha512-${crypto.createHash('sha512').update(buf).digest('base64')}`;
  if (got !== GSAP.integrity) throw new Error(`GSAP ${GSAP.version} does not match npm's checksum; nothing was kept`);
  const tmp = fs.mkdtempSync(path.join(HOME, '.gsap-'));
  try {
    fs.writeFileSync(path.join(tmp, 'gsap.tgz'), buf);
    await run('tar', ['-xzf', path.join(tmp, 'gsap.tgz'), '-C', tmp]);
    fs.mkdirSync(gsapDir(), { recursive: true });
    for (const f of GSAP.files) fs.copyFileSync(path.join(tmp, 'package', 'dist', f), path.join(gsapDir(), f));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  return gsapDir();
}

// a scene draws with GSAP when it reaches for the scene's timelines or the library itself
const USES = /\bc\.(?:gs|loops)\b|\bgsap\./;

/** Whether any of these script sources needs GSAP. */
export const needsGsap = (sources) => sources.some((src) => USES.test(src));

/** The library's scripts, in load order, for a page; a clear error when it is not installed. */
export function gsapScripts() {
  if (!gsapReady()) throw new Error(`a scene draws with GSAP, which is not installed: run \`demo.mjs doctor --fix\` (it fetches GSAP ${GSAP.version} from npm)`);
  return GSAP.files.map((f) => fs.readFileSync(path.join(gsapDir(), f), 'utf8'));
}
