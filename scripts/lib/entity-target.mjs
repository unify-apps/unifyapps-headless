// What a person names when they ask for a change to one entity. Pure: no
// files and no network.
import { UaError, normalizeTenant } from './contracts.mjs';

const BUILDER_LINKS = [
  [/^\/p\/[^/]+\/interfaces\/([^/?#]+)\/builder\/page\/([^/?#]+)/i, (m) => ({ kind: 'page', id: m[2], appId: m[1] })],
  [/^\/p\/[^/]+\/interfaces\/([^/?#]+)/i, (m) => ({ kind: 'app', id: m[1] })],
  [/^\/p\/[^/]+\/objects\/([^/?#]+)/i, (m) => ({ kind: 'object', id: m[1] })],
  [/^\/p\/[^/]+\/automations\/([^/?#]+)/i, (m) => ({ kind: 'automation', id: m[1] })],
];
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

function decoded(value) {
  let id;
  try { id = decodeURIComponent(value); } catch { throw new UaError('USAGE', 'Invalid entity link.'); }
  if (!SAFE_ID.test(id)) throw new UaError('USAGE', 'Invalid entity id in the link.');
  return id;
}

export function parseEntityInput(text, tenant) {
  const value = String(text ?? '').replace(/\s+/gu, ' ').trim();
  if (!value) throw new UaError('USAGE', 'An entity link, id or name is required.');
  const link = /^https?:\/\/([^/\s?#]+)(\/\S*)?$/i.exec(value);
  if (link) {
    // A published app's own address names the app in its host, often with no path.
    const published = PUBLISHED_HOST.exec(link[1].toLowerCase());
    const host = published ? `${published[2]}.${published[3]}.unifyapps.com` : normalizeTenant(link[1]);
    if (host !== tenant) throw new UaError('TENANT_MISMATCH', { urlHost: host, tenant, what: 'link' });
    if (published) return { kind: 'app', id: decoded(published[1]) };
    for (const [pattern, shape] of BUILDER_LINKS) {
      const match = pattern.exec(link[2] ?? '/');
      if (!match) continue;
      const target = shape(match);
      return Object.fromEntries(Object.entries(target).map(([key, item]) => [key, key === 'kind' ? item : decoded(item)]));
    }
    throw new UaError('USAGE', 'This link is not an app, page, object or automation builder link.');
  }
  if (/^obj_[A-Za-z0-9_]+$/i.test(value)) return { kind: 'object', id: value };
  if (/^[0-9a-f]{24}$/.test(value)) return { kind: 'automation', id: value };
  return { kind: 'name', name: value };
}

// Shapes follow entityUrl in entity-links.mjs. `custom` and `create` are the
// AI agent list and create screens, not agent ids.
const OTHER_LINKS = [
  [/^\/p\/[^/]+\/solutions\/([^/?#]+)/i, (m) => ({ kind: 'solution', id: m[1] })],
  [/^\/p\/[^/]+\/connections\/edit\/([^/?#]+)/i, (m) => ({ kind: 'connection', id: m[1] })],
  [/^\/p\/[^/]+\/ai-agents\/(?!(?:custom|create)(?:[/?#]|$))([^/?#]+)/i, (m) => ({ kind: 'agent', id: m[1] })],
];
const URL_IN_TEXT = /\[[^\]]*\]\((https?:\/\/[^)\s]*)\)|<(https?:\/\/[^>\s]*)>|(https?:\/\/[^\s<>[\]]*)/giu;
const BARE_ID = /(?<![\w/.-])(e_[A-Za-z0-9_]+|obj_[A-Za-z0-9_]+|[0-9a-f]{24})(?![\w-])/giu;

function idForm(id) {
  if (/^(?:e_|obj_)[A-Za-z0-9_]+$/i.test(id) || /^[0-9a-f]{24}$/.test(id)) return 'id';
  return SAFE_ID.test(id) ? 'slug' : 'name';
}

// A published app's own address, built the same way the page-quality tooling builds it:
// `<app id>-<tenant>.matrix-<env>.unifyapps.com` for the tenant `<tenant>.<env>.unifyapps.com`.
// A tenant name with a hyphen splits wrong; the app is then not found and the person is asked for the builder link.
const PUBLISHED_HOST = /^([a-z0-9][a-z0-9-]*)-([a-z0-9]+)\.matrix-([a-z0-9]+)\.unifyapps\.com$/;

function linkFrom(raw) {
  const url = /^https?:\/\/([^/?#\s]*)([^?#\s]*)/i.exec(raw);
  const host = url?.[1] ? url[1].toLowerCase() : null;
  const base = { raw, host, kind: 'unknown', id: null, appId: null, idForm: null };
  if (!host) return { ...base, valid: false, reason: 'no host' };
  const published = PUBLISHED_HOST.exec(host);
  if (published) {
    const [, app, tenant, env] = published;
    return { ...base, host: `${tenant}.${env}.unifyapps.com`, kind: 'app', id: app, idForm: idForm(app), valid: true, reason: null, published: host };
  }
  for (const [pattern, shape] of [...BUILDER_LINKS, ...OTHER_LINKS]) {
    const match = pattern.exec(url[2]);
    if (!match) continue;
    const target = shape(match);
    let id, appId = null;
    try { id = decodeURIComponent(target.id); appId = target.appId ? decodeURIComponent(target.appId) : null; }
    catch { return { ...base, kind: target.kind, valid: false, reason: 'bad encoding' }; }
    return { ...base, kind: target.kind, id, appId, idForm: idForm(id), valid: true, reason: null };
  }
  return { ...base, valid: false, reason: 'unknown path' };
}

/** Every entity link and bare entity id in free text, the first kept per host, kind and id. */
export function extractLinks(text) {
  const value = String(text ?? ''), found = [], seen = new Set(), spans = [];
  const add = (link) => {
    const key = `${link.host}|${link.kind}|${link.id ?? link.raw}`;
    if (!seen.has(key)) { seen.add(key); found.push(link); }
  };
  for (const match of value.matchAll(URL_IN_TEXT)) {
    spans.push([match.index, match.index + match[0].length]);
    add(linkFrom((match[1] ?? match[2] ?? match[3]).replace(/[.,;:)!?'"]+$/u, '')));
  }
  for (const match of value.matchAll(BARE_ID)) {
    if (spans.some(([from, to]) => match.index >= from && match.index < to)) continue;
    const id = match[1];
    const kind = /^obj_/i.test(id) ? 'object' : /^[0-9a-f]{24}$/.test(id) ? 'automation' : 'unknown';
    add({ raw: id, host: null, kind, id, appId: null, idForm: 'id', valid: true, reason: null });
  }
  return found;
}
