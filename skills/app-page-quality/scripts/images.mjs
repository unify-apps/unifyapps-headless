/**
 * Image addresses, header parsing, the network probe, and P4 (image size and format).
 * See references/rulebook.md's P4 entry and Thresholds table for the prose and numbers
 * this mirrors; page-audit.mjs only orchestrates the three exports below.
 */
import fs from 'node:fs';
import path from 'node:path';
import { tenantFetch } from '../../../scripts/platform/tenant-fetch.mjs';
import { normalizeTenant } from '../../../scripts/lib/contracts.mjs';
import { makeFinding } from './rules-structure.mjs';
import { blockBox } from './walk.mjs';

const RANGE_FIRST = 'bytes=0-4095';
const RANGE_WIDE = 'bytes=0-65535';

// ---- address collection --------------------------------------------------------------------

// P4 measures against the box in points (a size token counts: w-12 is 48pt), so a side set
// any other way ("100%", "w-full", flex) leaves it unmeasured but set; X3 reads the same
// blockBox and only asks whether both sides are set.
function boxPtOf(block) {
  const { width, height } = blockBox(block);
  return typeof width === 'number' && typeof height === 'number' ? [width, height] : null;
}

// The sides of an Image's box that are not set at all.
function missingSidesOf(block) {
  const box = blockBox(block);
  return ['width', 'height'].filter(side => box[side] === null);
}

function addressFromImageBlock(block) {
  const data = block.content?.data;
  if (!data) return null;
  const src = data.type === 'UPLOAD' ? data.uploadDetails?.url : data.src;
  if (typeof src !== 'string' || !src) return null;
  const addressPath = data.type === 'UPLOAD' ? 'content.data.uploadDetails.url' : 'content.data.src';
  return { url: src, blockId: block.id, blockName: block.name, path: addressPath, boxPt: boxPtOf(block), missingSides: missingSidesOf(block), bound: src.includes('{{') };
}

function addressFromBackgroundImage(block) {
  const custom = block.styles?.backgroundImage?.custom;
  if (typeof custom !== 'string' || !custom) return null;
  return { url: custom, blockId: block.id, blockName: block.name, path: 'appearance.styles.backgroundImage.custom', boxPt: boxPtOf(block), bound: custom.includes('{{') };
}

// A page variable (e.g. a tab bar's NAV_ICONS) can hold one image URL directly, or a
// JSON string whose nested string values are URLs — never both at once in practice, so the
// direct match is tried first and the JSON walk only runs when that fails.
const IMAGE_URL_PATTERN = /^https?:\/\/\S+\.(?:webp|png|jpe?g|gif|svg)(?:\?\S*)?$/iu;

function collectNestedImageUrls(value, out) {
  if (typeof value === 'string') {
    if (IMAGE_URL_PATTERN.test(value)) out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectNestedImageUrls(item, out);
    return;
  }
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value)) collectNestedImageUrls(nested, out);
  }
}

function imageUrlsFromVariable(initialValue) {
  if (typeof initialValue !== 'string') return [];
  if (IMAGE_URL_PATTERN.test(initialValue)) return [initialValue];
  let parsed;
  try {
    parsed = JSON.parse(initialValue);
  } catch {
    return []; // a plain non-matching string — nothing more to read
  }
  if (!parsed || typeof parsed !== 'object') return [];
  const urls = [];
  collectNestedImageUrls(parsed, urls);
  return urls;
}

// A page variable never carries box sizing — only the block that renders it does — so these
// addresses always carry boxPt: null; P4 judges them on type and file size alone.
function addressesFromPageVariables(pageVariables) {
  const addresses = [];
  for (const variable of Object.values(pageVariables ?? {})) {
    if (!variable || typeof variable !== 'object') continue;
    for (const url of imageUrlsFromVariable(variable.initialValue)) {
      addresses.push({
        url,
        blockId: null,
        blockName: variable.name ?? variable.id,
        path: `pageVariables.${variable.id}.initialValue`,
        boxPt: null,
        bound: false,
      });
    }
  }
  return addresses;
}

/**
 * `collectImageAddresses(walk, { pageVariables }) → { url, blockId, blockName, path, boxPt: [w, h] | null, missingSides?, bound }[]`.
 * `boxPt` is the box in points when both sides are; an Image block's address also carries
 * `missingSides`, the sides not set at all.
 * Covers Image blocks (`content.data.src`, or `uploadDetails.url` for an upload), background
 * images (`appearance.styles.backgroundImage.custom`), and image URLs held in a page variable's
 * `initialValue` (directly, or nested inside a JSON string — a tab bar's `NAV_ICONS`).
 * Carousel slides are ordinary child blocks on this platform, so walking the whole tree already
 * reaches them — no separate Carousel path.
 */
export function collectImageAddresses(walk, { pageVariables = {} } = {}) {
  const addresses = [];
  for (const id of walk.order) {
    const block = walk.facts.get(id);
    if (block.type === 'Image') {
      const address = addressFromImageBlock(block);
      if (address) addresses.push(address);
    }
    const backgroundAddress = addressFromBackgroundImage(block);
    if (backgroundAddress) addresses.push(backgroundAddress);
  }
  addresses.push(...addressesFromPageVariables(pageVariables));
  return addresses;
}

// ---- header parsing ---------------------------------------------------------------------

function dataViewOf(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function bytesEqual(bytes, offset, expected) {
  return expected.every((byte, index) => bytes[offset + index] === byte);
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function parsePng(bytes) {
  if (bytes.length < 24 || !bytesEqual(bytes, 0, PNG_SIGNATURE)) return null;
  const dataView = dataViewOf(bytes);
  return { type: 'png', width: dataView.getUint32(16), height: dataView.getUint32(20) };
}

function parseJpeg(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const dataView = dataViewOf(bytes);
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    // RSTn, TEM and EOI carry no length field and no payload to skip over.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2;
      continue;
    }
    const length = dataView.getUint16(offset + 2);
    if (marker === 0xc0 || marker === 0xc2) {
      // SOF0/SOF2: length(2) + precision(1) + height(2) + width(2), starting right after the marker.
      if (offset + 9 > bytes.length) return null; // present but past what we fetched — caller widens the range
      return { type: 'jpeg', height: dataView.getUint16(offset + 5), width: dataView.getUint16(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

function parseGif(bytes) {
  if (bytes.length < 10) return null;
  const header = String.fromCharCode(...bytes.subarray(0, 6));
  if (header !== 'GIF87a' && header !== 'GIF89a') return null;
  const dataView = dataViewOf(bytes);
  return { type: 'gif', width: dataView.getUint16(6, true), height: dataView.getUint16(8, true) };
}

function read24LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function parseWebp(bytes) {
  if (bytes.length < 16 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'RIFF' || String.fromCharCode(...bytes.subarray(8, 12)) !== 'WEBP') return null;
  const fourCC = String.fromCharCode(...bytes.subarray(12, 16));
  const dataView = dataViewOf(bytes);
  if (fourCC === 'VP8 ') {
    // lossy: 3-byte frame tag + 3-byte start code (0x9d 0x01 0x2a) after the chunk header,
    // then two 14-bit dimensions (top 2 bits are a scale factor, masked off here).
    if (bytes.length < 30) return null;
    return { type: 'webp', width: dataView.getUint16(26, true) & 0x3fff, height: dataView.getUint16(28, true) & 0x3fff };
  }
  if (fourCC === 'VP8L') {
    if (bytes.length < 25) return null;
    const word = dataView.getUint32(21, true); // 14-bit (width-1) then 14-bit (height-1), packed LSB-first
    return { type: 'webp', width: (word & 0x3fff) + 1, height: ((word >>> 14) & 0x3fff) + 1 };
  }
  if (fourCC === 'VP8X') {
    if (bytes.length < 30) return null;
    return { type: 'webp', width: read24LE(bytes, 24) + 1, height: read24LE(bytes, 27) + 1 };
  }
  return null;
}

function parseSvg(bytes, contentType) {
  const text = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('utf8');
  if (!(contentType?.includes('svg') || /<svg[\s>]/u.test(text))) return null;
  const viewBoxMatch = /viewBox\s*=\s*["']([^"']+)["']/iu.exec(text);
  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].trim().split(/[\s,]+/u).map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite)) return { type: 'svg', width: parts[2], height: parts[3] };
  }
  const widthMatch = /\bwidth\s*=\s*["']?(\d+(?:\.\d+)?)/iu.exec(text);
  const heightMatch = /\bheight\s*=\s*["']?(\d+(?:\.\d+)?)/iu.exec(text);
  if (widthMatch && heightMatch) return { type: 'svg', width: Number(widthMatch[1]), height: Number(heightMatch[1]) };
  return null;
}

/** `parseImageHeader(bytes, contentType?) → { type, width, height } | null`. */
export function parseImageHeader(bytes, contentType) {
  if (!bytes || bytes.length === 0) return null;
  return parsePng(bytes) ?? parseJpeg(bytes) ?? parseGif(bytes) ?? parseWebp(bytes) ?? parseSvg(bytes, contentType) ?? null;
}

// ---- probe ----------------------------------------------------------------------------------

function readCacheFile(cacheFile) {
  if (!cacheFile) return {};
  try {
    return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  } catch {
    return {};
  }
}

function writeCacheFile(cacheFile, cache) {
  if (!cacheFile) return;
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
}

function totalBytesFrom(headers, fallback) {
  const contentRange = headers.get('content-range'); // "bytes 0-4095/212000"
  const rangeMatch = contentRange && /\/(\d+)$/u.exec(contentRange);
  if (rangeMatch) return Number(rangeMatch[1]);
  const contentLength = headers.get('content-length');
  return contentLength ? Number(contentLength) : fallback;
}

function isSuccessStatus(status) {
  return typeof status === 'number' && status >= 200 && status < 300;
}

// A tenant's private file is stored as a path on the tenant ("/api/file/download/…"), so it
// resolves against the tenant and then goes through the cookie-attaching gate in fetchRange.
function resolveAddress(url, tenant) {
  if (url.startsWith('/') && !url.startsWith('//')) {
    return tenant ? { url: `https://${normalizeTenant(tenant)}${url}` } : { error: 'a tenant path, and no tenant to resolve it against' };
  }
  return URL.canParse(url) ? { url } : { error: 'unparsable address' };
}

const isRedirectStatus = status => typeof status === 'number' && status >= 300 && status < 400;

/**
 * One ranged read of `url`, as a response or `{ error }`. Only a request whose host IS the tenant
 * goes through the cookie-attaching gate, and it never follows a redirect there: the tenant
 * answers `/api/file/download/…` with a 303 to a signed storage address, which is read here with
 * a bare fetch carrying the Range header and no cookie (a signed address needs none, and the
 * tenant's cookie never leaves the tenant) — the way `makeDownload` in
 * scripts/platform/ua-tenant.mjs reads an attachment. A redirect to anything but an https
 * address is not followed.
 */
async function fetchRange(url, range, { fetchImpl, tenant, tenantFetchImpl, signal }) {
  const init = { headers: { Range: range }, signal };
  const parsed = new URL(url);
  if (!tenant || parsed.hostname !== normalizeTenant(tenant)) return fetchImpl(url, init);
  const response = await tenantFetchImpl(tenant, parsed.pathname + parsed.search, { ...init, redirect: 'manual' }, { fetchImpl });
  if (!isRedirectStatus(response.status)) return response;
  const location = response.headers.get('location');
  if (!location) return { error: `the tenant answered http ${response.status} with no Location` };
  if (!location.startsWith('https://') || !URL.canParse(location)) return { error: 'the tenant redirected to an address that is not https' };
  return fetchImpl(location, init);
}

async function probeOnce(url, options) {
  const response = await fetchRange(url, RANGE_FIRST, options);
  if (response.error) return { error: response.error };
  // A 404/403/5xx body (an error page, often valid-looking HTML with its own <svg> icons)
  // must never be parsed as the image — only its status is reported, nothing is cached.
  if (!isSuccessStatus(response.status)) return { error: `http ${response.status}` };
  let bytes = new Uint8Array(await response.arrayBuffer());
  const contentType = response.headers.get('content-type');
  let total = totalBytesFrom(response.headers, bytes.length);
  let parsed = parseImageHeader(bytes, contentType);

  // A camera's EXIF/thumbnail data in APP1 routinely pushes a JPEG's SOF0/SOF2 marker past
  // our first 4KB probe; one wider re-fetch recovers it instead of mis-reporting "unreadable".
  if (!parsed && bytes[0] === 0xff && bytes[1] === 0xd8) {
    const widerResponse = await fetchRange(url, RANGE_WIDE, options);
    if (widerResponse.error) return { error: widerResponse.error };
    if (!isSuccessStatus(widerResponse.status)) return { error: `http ${widerResponse.status}` };
    bytes = new Uint8Array(await widerResponse.arrayBuffer());
    total = totalBytesFrom(widerResponse.headers, bytes.length);
    parsed = parseImageHeader(bytes, contentType);
  }

  if (!parsed) return { error: 'unrecognized-format', bytes: total };
  return { type: parsed.type, width: parsed.width, height: parsed.height, bytes: total };
}

// A timeout or a dropped connection is often gone a moment later, so a fetch that throws gets
// one more try; an HTTP status or an unreadable header is the server's answer and does not.
const NETWORK_TRIES = 2;

// The tenant's own answer that UnifyApps Headless may not go on — signed out, production,
// no permission — is never an unprobed image: it stops the audit, word for word.
export const REFUSALS = new Set(['AUTH_EXPIRED', 'PRODUCTION_BLOCKED', 'ENVIRONMENT_UNCONFIRMED', 'PERMISSION_REQUIRED']);

async function probeNetworkAddress(address, { fetchImpl, tenant, tenantFetchImpl, timeoutMs }) {
  const target = resolveAddress(address, tenant);
  if (target.error) return target;
  let reason;
  for (let attempt = 0; attempt < NETWORK_TRIES; attempt += 1) {
    const signal = AbortSignal.timeout(timeoutMs);
    try {
      return await probeOnce(target.url, { fetchImpl, tenant, tenantFetchImpl, signal });
    } catch (error) {
      if (REFUSALS.has(error?.code)) throw error;
      reason = signal.aborted ? 'timeout' : (error?.message ?? 'fetch-failed');
    }
  }
  return { error: reason };
}

function probeDataUri(url) {
  const match = /^data:([^;,]*)(;base64)?,(.*)$/su.exec(url);
  if (!match) return { error: 'unparsable-data-uri' };
  const [, mediaType, isBase64, payload] = match;
  let bytes;
  try {
    bytes = isBase64 ? new Uint8Array(Buffer.from(payload, 'base64')) : new TextEncoder().encode(decodeURIComponent(payload));
  } catch {
    return { error: 'unparsable-data-uri' }; // a malformed percent-encoding throws URIError
  }
  const parsed = parseImageHeader(bytes, mediaType);
  if (!parsed) return { error: 'unrecognized-format', bytes: bytes.length };
  return { type: parsed.type, width: parsed.width, height: parsed.height, bytes: bytes.length };
}

/**
 * `probeImages(addresses, { fetchImpl, tenant, tenantFetchImpl = tenantFetch, cacheFile,
 * timeoutMs = 5000 }) → Map<url, result>`. A bound address (`{{ … }}`) is never resolvable to
 * a real address, so it is skipped before any URL handling. A `data:` URI is decoded in place
 * and never fetched. A `/`-relative address is a path on `tenant`. A fetch that throws (a
 * timeout, a dropped connection) is tried once more. Everything else is fetched at most once
 * per call — a repeat `url` in
 * `addresses`, or a SUCCESSFUL result already sitting in `cacheFile` from an earlier run, is
 * served from memory/disk instead. A result carrying `error` (a timeout, a non-2xx status, an
 * auth or production-gate refusal) is never cached — it is transient or address-specific, not
 * a fact about the image, so the next run must retry it rather than freeze the failure in.
 */
export async function probeImages(addresses, { fetchImpl, tenant, tenantFetchImpl = tenantFetch, cacheFile, timeoutMs = 5000 } = {}) {
  const cache = readCacheFile(cacheFile);
  const results = new Map();
  let cacheChanged = false;

  for (const address of addresses) {
    if (address.bound || results.has(address.url)) continue;
    if (address.url.startsWith('data:')) {
      results.set(address.url, probeDataUri(address.url));
      continue;
    }
    if (cache[address.url]) {
      results.set(address.url, cache[address.url]);
      continue;
    }
    const probed = await probeNetworkAddress(address.url, { fetchImpl, tenant, tenantFetchImpl, timeoutMs });
    results.set(address.url, probed);
    if (!probed.error) {
      cache[address.url] = probed;
      cacheChanged = true;
    }
  }

  if (cacheChanged) writeCacheFile(cacheFile, cache);
  return results;
}

// ---- P4 — image size and format ------------------------------------------------------------

const RIGHT_FORMATS = new Set(['webp', 'svg']);
const NOT_PROBED = 'not probed: ';

/** A P4 finding for an image the probe could not measure; page-audit counts them as `summary.unprobed`. */
export const isUnprobedFinding = finding => finding.rule === 'P4' && finding.detail.startsWith(NOT_PROBED);

// A box's two axes rarely disagree in practice (icons and avatars are square), but when an
// image's aspect ratio doesn't match the box exactly, the SMALLER per-axis ratio is the
// binding constraint: it is the axis that is closest to looking blurry, and using it instead
// of the larger axis keeps a merely-letterboxed image from being flagged as oversized.
function sizeRatio(width, height, boxWidth, boxHeight, scale) {
  return Math.min(width / (boxWidth * scale), height / (boxHeight * scale));
}

function formatSide(widthPx, heightPx) {
  return widthPx === heightPx ? `${widthPx}` : `${widthPx}×${heightPx}`;
}

// A background-image or page-variable address has no "the box was simply never set" story —
// a background paints whatever area its block already has, and a variable isn't rendered by
// anything on its own — so the missing-dimensions check (R16) is scoped to a real Image block,
// identified the only way an address exposes that: which stored path it came from.
function isImageBlockAddress(address) {
  return address.path === 'content.data.src' || address.path === 'content.data.uploadDetails.url';
}

/**
 * `imageFindings(addresses, probed, { scale, thresholds }) → Finding[]` for P4. page-audit.mjs
 * calls it only when the probe ran, so P4 is silent under `--no-images`.
 * - A STATIC (non-bound) Image block with a side not set at all is advisory, naming the side (a
 *   bound Image's missing box is X3's). A side set some other way (`w-full`, a percentage, flex)
 *   is set: it only leaves the box unmeasured.
 * - An address with no box in points (`boxPt: null`: a side not in points, or a page variable,
 *   which no block sizes) is judged on its type and file size alone, never its ratio.
 * - An SVG is a vector: its viewBox ratio says nothing about decode/paint cost the way a
 *   raster's intrinsic pixel count does, so it is judged on file size alone, never ratio.
 * - An address the probe could not measure is advisory `not probed: <reason>`, so a failed
 *   probe never reads as a clean image.
 */
export function imageFindings(addresses, probed, { scale = 3, thresholds }) {
  const findings = [];
  for (const address of addresses) {
    if (address.bound) continue;
    const result = probed.get(address.url);
    if (result?.error) {
      findings.push(makeFinding('P4', 'advisory', { id: address.blockId, name: address.blockName }, address.path,
        `${NOT_PROBED}${result.error}`, 'probe it by hand (open the address) and re-run'));
    }

    const missing = isImageBlockAddress(address) ? address.missingSides ?? [] : [];
    if (missing.length > 0) {
      findings.push(makeFinding('P4', 'advisory', { id: address.blockId, name: address.blockName }, address.path,
        `no fixed box: ${missing.join(' and ')} missing`,
        missing.length === 2 ? 'set both width and height so the box is known before the picture arrives' : `set the ${missing[0]} too, so the box is known before the picture arrives`));
    }

    if (!result || result.error) continue;

    const { type, width, height, bytes } = result;
    const isSvg = type === 'svg';
    const box = address.boxPt;
    const ratio = box && !isSvg ? sizeRatio(width, height, box[0], box[1], scale) : null;

    const isBlocking = (ratio !== null && ratio > thresholds.imageMaxRatio) || bytes > thresholds.imageBlockingBytes;
    const isAdvisory = (ratio !== null && ratio < thresholds.imageMinRatio) || !RIGHT_FORMATS.has(type) || bytes > thresholds.imageAdvisoryBytes;
    if (!isBlocking && !isAdvisory) continue;

    const kb = Math.round(bytes / 1000);
    const sizeLabel = `${width}×${height} ${type.toUpperCase()} (${kb} KB)`;
    let detail;
    let fix;
    if (ratio !== null) {
      detail = `${sizeLabel} in a ${box[0]}×${box[1]} box (×${scale} = ${formatSide(box[0] * scale, box[1] * scale)}px): ${ratio.toFixed(1)}× the box`;
      fix = `re-export as WebP (SVG for a glyph) at ${formatSide(box[0] * scale, box[1] * scale)}px, under 200 KB, with both width and height set explicitly`;
    } else if (isSvg) {
      detail = `${sizeLabel}: a vector has no pixel ratio to measure, judged by file size alone`;
      fix = 'simplify the SVG (fewer paths, no embedded raster data) to bring it under 200 KB';
    } else {
      detail = `${sizeLabel}; ${address.blockName} has no box in points, so only its type and file size can be judged`;
      fix = 're-export as WebP (SVG for a glyph), under 200 KB';
    }

    findings.push(makeFinding('P4', isBlocking ? 'blocking' : 'advisory', { id: address.blockId, name: address.blockName }, address.path, detail, fix));
  }
  return findings;
}
