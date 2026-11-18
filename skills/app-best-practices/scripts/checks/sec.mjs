// Security (SEC): who can see what, and what the stored config leaks.
import { appTarget, blockTarget, isBinding, isBlank, isPlainObject, listOf, liveActions, pageRef, pageTarget, walkedFacts } from './shared.mjs';

const hasGroups = value => isPlainObject(value) && Object.keys(value).length > 0;

// ---- secret-shaped values (api-keys-tokens-secrets-head, key-token-password-shaped-value) --------------------------------------------------

// Server-side credentials only. A Google browser key (AIza…) and a Stripe publishable key are
// meant to ship in a page, so neither is here.
const SECRET_SHAPES = [
  ['an AWS access key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/u],
  ['a Stripe secret key', /\b[rs]k_(?:live|test)_[0-9A-Za-z]{16,}/u],
  ['an OpenAI- or Anthropic-style secret key', /\bsk-(?=[\w-]*\d)[\w-]{20,}/u],
  ['a GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_\w{22,})/u],
  ['a Slack token', /\bxox[abposr]-[A-Za-z0-9-]{10,}/u],
  ['a private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/u],
  ['a JSON web token', /\beyJ[\w-]{10,}\.eyJ[\w-]{10,}\.[\w-]{10,}/u],
  ['a bearer token', /\bBearer\s+[\w.~+/-]{20,}=*/u],
];
const SECRET_NAME = /password|passwd|secret|apikey|apitoken|accesstoken|authtoken|refreshtoken|bearertoken|privatekey/u;
const PLACEHOLDER = /^(?:x{3,}|\*{3,}|your|change|example|placeholder|dummy|sample|redacted|<)/iu;

const isSecretName = name => {
  const plain = String(name).toLowerCase().replace(/[^a-z0-9]/gu, '');
  return plain === 'token' || SECRET_NAME.test(plain);
};
// A literal that could be a credential: long, one token, letters and digits, not a placeholder.
const looksLikeSecretLiteral = value => typeof value === 'string' && /^[\w\-+/=.~!@#%^*]{12,}$/u.test(value)
  && /[A-Za-z]/u.test(value) && /\d/u.test(value) && !PLACEHOLDER.test(value) && !value.startsWith('AIza');
const NAMED_LITERAL = /["']?([A-Za-z_$][\w$-]*)["']?\s*[:=]\s*(["'`])([^"'`\s]{12,})\2/gu;

/**
 * What in `text` is secret-shaped, as phrases that never repeat the value. `name` is what the whole
 * text is stored under (a variable or attribute name): a credential name makes a bare literal count.
 */
function secretsIn(text, name) {
  if (typeof text !== 'string' || !text) return [];
  const found = [];
  for (const [kind, pattern] of SECRET_SHAPES) {
    const match = pattern.exec(text);
    if (match) found.push(`a ${match[0].length}-char value shaped like ${kind}`);
  }
  for (const [, assigned, , value] of text.matchAll(NAMED_LITERAL)) {
    if (isSecretName(assigned) && looksLikeSecretLiteral(value)) found.push(`a ${value.length}-char literal assigned to "${assigned}"`);
  }
  if (!found.length && name && isSecretName(name) && looksLikeSecretLiteral(text)) found.push(`a ${text.length}-char literal under the credential name "${name}"`);
  return found;
}

// ---- where custom code and HTML attributes live ---------------------------------------------

/** Page and app header/footer code: `{ page, target, path, text }` (concepts/interface-record/custom-code.md). */
function customCodeSites(app) {
  const sites = [];
  const add = (page, target, owner, code) => {
    for (const half of ['header', 'footer']) {
      if (typeof code?.[half] === 'string' && code[half]) sites.push({ page, target, path: `${owner}customCode.${half}`, text: code[half] });
    }
  };
  add(null, appTarget(app), 'app ', app.record?.properties?.customCode);
  for (const page of app.pages) add(pageRef(page), pageTarget(page), '', page.record?.properties?.customCode);
  return sites;
}

/** Every `{ key, value }` HTML attribute: each walked block's `additional.htmlAttributes`, and the app record's. */
function htmlAttributeSites(app) {
  const sites = [];
  const add = (page, target, path, pairs) => {
    if (Array.isArray(pairs)) pairs.forEach((pair, index) => sites.push({ page, target, path: `${path}[${index}]`, key: String(pair?.key ?? ''), value: pair?.value }));
  };
  add(null, appTarget(app), 'app customCode.htmlAttributes', app.record?.properties?.customCode?.htmlAttributes);
  for (const page of app.pages) {
    for (const id of page.walk.order) add(pageRef(page), blockTarget(page, id), 'additional.htmlAttributes', page.blocks[id]?.additional?.htmlAttributes);
  }
  return sites;
}

// ---- the rest -------------------------------------------------------------------------------

// Attributes the browser runs or opens (ua-secure-by-default/references/rendering-and-uploads.md).
const RUNS_OR_OPENS = new Set(['href', 'src', 'style', 'srcdoc', 'formaction', 'action', 'xlink:href']);
const runsOrOpens = key => /^on/iu.test(key.trim()) || RUNS_OR_OPENS.has(key.trim().toLowerCase());

const HTML_OR_CODE_SINK = /\beval\s*\(|\bnew\s+Function\s*\(|\.(?:inner|outer)HTML\s*\+?=|\binsertAdjacentHTML\s*\(|\bdocument\.write(?:ln)?\s*\(/u;
const BROWSER_INPUT = /\blocation\.(?:search|hash|href)\b|\bURLSearchParams\b|\b(?:local|session)Storage\b|\bdocument\.cookie\b/u;

// The five sign-in slugs are public whatever the page says (concepts/pages/routing-and-urls.md).
const ALWAYS_PUBLIC_SLUGS = new Set(['login', 'signup', 'mfa-verification', 'reset-password', 'forgot-password']);

// What a file uploads as when nothing is set: ALL_USERS, the platform's default;
// the two older spellings are the same scopes.
const UPLOAD_FALLBACK = 'ALL_USERS';
const VISIBILITY_ALIASES = { RESTRICTED: 'ALL_USERS', ONLY_ME: 'USER' };
const UPLOADING_OPERATIONS = new Set(['uploadFiles', 'capturePhoto']);

const AUTH_TOKEN = /getAuthToken/u;
const SHOWN_OR_OPENED_KEYS = new Set(['value', 'text', 'label', 'title', 'subtitle', 'description', 'message', 'placeholder', 'helperText', 'tooltip', 'caption', 'url', 'href', 'src', 'link', 'uri', 'source', 'content']);
const IN_QUERY_STRING = /[?&][^=\s&]*=\s*\{\{[^}]*getAuthToken/u;
const URL_OR_MESSAGE_ACTIONS = new Set(['navigate', 'navigateToPage', 'setUrlParameters', 'showNotification']);
const lastKey = path => path.split('.').pop().replace(/\[\d+\]$/u, '');

/** Where a block shows or opens the auth token: a display or link key, or a query string. */
function authTokenLeaks(page, id) {
  const fromBindings = page.walk.facts.get(id).bindings
    .filter(binding => AUTH_TOKEN.test(binding.text) && binding.path.startsWith('component.content.') && !binding.path.includes('.inputs.'))
    .filter(binding => SHOWN_OR_OPENED_KEYS.has(lastKey(binding.path)) || IN_QUERY_STRING.test(binding.text))
    .map(binding => binding.path);
  const pairs = page.blocks[id]?.additional?.htmlAttributes;
  const fromAttributes = listOf(pairs)
    .filter(pair => ['href', 'src'].includes(String(pair?.key).toLowerCase()) && typeof pair?.value === 'string' && AUTH_TOKEN.test(pair.value))
    .map(pair => `additional.htmlAttributes ${pair.key}`);
  return [...fromBindings, ...fromAttributes];
}

export const secChecks = [
  {
    // Only the root key is read: the block renderer checks block.permissions and nothing nested.
    id: 'put-block-permissions-block-root',
    run: page => page.walk.order.flatMap(id => {
      const block = page.blocks[id];
      if (hasGroups(block.permissions)) return [];
      const misplaced = [['component.permissions', block.component?.permissions], ['component.content.permissions', block.component?.content?.permissions]]
        .find(([, value]) => hasGroups(value));
      return misplaced ? [{ target: blockTarget(page, id), evidence: `${misplaced[0]} names ${Object.keys(misplaced[1]).join(', ')} but block.permissions is not set, so every user sees the block` }] : [];
    }),
  },
  {
    // The app default (Advanced settings → File Management) only seeds the builder panel. A missing
    // value is a finding only when that default differs from what an unset upload gets.
    id: 'set-filevisibility-explicitly-fileupload-upload',
    run: (page, app) => {
      const stored = app.record?.properties?.metadata?.advanced?.fileManagement?.defaultFileVisibility;
      const wanted = VISIBILITY_ALIASES[stored] ?? stored;
      if (!wanted || wanted === UPLOAD_FALLBACK) return [];
      const blocks = walkedFacts(page, 'FileUpload')
        .filter(fact => isBlank(fact.content.fileVisibility))
        .map(fact => ({ target: blockTarget(page, fact.id), evidence: `content.fileVisibility is not set, so files upload as ${UPLOAD_FALLBACK} while the app default is ${stored}` }));
      const actions = liveActions(page)
        .filter(({ action }) => action.actionType === 'controlMediaUploads' && UPLOADING_OPERATIONS.has(action.payload?.operation) && isBlank(action.payload?.config?.fileVisibility))
        .map(({ target, action }) => ({ target, evidence: `controlMediaUploads ${action.payload.operation} has no payload.config.fileVisibility, so files upload as ${UPLOAD_FALLBACK} while the app default is ${stored}` }));
      return [...blocks, ...actions];
    },
  },
  {
    // Only the anchored popover and the GENERAL_ACCESS modal read the role keys
    // (actions/share-entity-record.md, Operations).
    id: 'give-popover-share-anchorblockid-modal',
    run: page => liveActions(page)
      .filter(({ action }) => action.actionType === 'shareEntityRecord')
      .flatMap(({ target, action }) => {
        const payload = action.payload ?? {};
        const restricts = [
          Array.isArray(payload.allowedRoleIds) && payload.allowedRoleIds.length ? 'allowedRoleIds' : null,
          typeof payload.defaultRoleId === 'string' && payload.defaultRoleId ? 'defaultRoleId' : null,
        ].filter(Boolean);
        if (!restricts.length || isBinding(payload.variant) || payload.modalVariant === 'GENERAL_ACCESS') return [];
        const anchored = typeof payload.anchorBlockId === 'string' && payload.anchorBlockId.trim() !== '';
        if (payload.variant === 'POPOVER' && anchored) return [];
        const why = payload.variant === 'POPOVER' ? 'variant POPOVER has no anchorBlockId, so the plain modal opens' : `variant ${payload.variant ?? 'unset'} without modalVariant GENERAL_ACCESS opens the plain modal`;
        return [{ target, evidence: `shareEntityRecord sets ${restricts.join(' and ')} but ${why}, which ignores them` }];
      }),
  },
  {
    id: 'set-page-permissions-through-app',
    run: (page, app) => {
      const own = page.record?.properties?.permissions;
      if (!hasGroups(own) || hasGroups(app.record?.properties?.pagePermissions?.[page.id])) return [];
      return [{ target: pageTarget(page), evidence: `the page's own properties.permissions names ${Object.keys(own).join(', ')}, but the app record's pagePermissions has nothing for this page, so nothing gates it` }];
    },
  },
  {
    // Public is the union of publicPageIds and entityDetailsMap[id].isPublic. Only an explicit
    // "private" counts: the page tools write the record alone and can leave publicAccess absent.
    id: 'make-page-private-removing-both',
    run: (page, app) => {
      if (page.global || ALWAYS_PUBLIC_SLUGS.has(page.slug)) return [];
      const record = app.record?.properties ?? {};
      const details = record.entityDetailsMap?.[page.id];
      const madePrivate = [
        page.record?.properties?.publicAccess === false ? 'the page\'s publicAccess is false' : null,
        details?.isPublic === false ? `entityDetailsMap.${page.id}.isPublic is false` : null,
      ].filter(Boolean);
      const stillPublic = [
        Array.isArray(record.publicPageIds) && record.publicPageIds.includes(page.id) ? 'publicPageIds lists it' : null,
        details?.isPublic === true ? `entityDetailsMap.${page.id}.isPublic is true` : null,
      ].filter(Boolean);
      if (!madePrivate.length || !stillPublic.length) return [];
      return [{ target: pageTarget(page), evidence: `${madePrivate.join(' and ')}, but ${stillPublic.join(' and ')}, so the page still serves without a sign-in` }];
    },
  },
  {
    // getAuthToken exists only in a MOBILE app (concepts/data-binding/utils.md, Availability); on
    // the web the binding resolves to nothing, so there is nothing to leak.
    id: 'never-put-utils-getauthtoken-output',
    run: (page, app) => {
      if (app.type !== 'MOBILE') return [];
      const onBlocks = page.walk.order.flatMap(id => {
        const leaks = authTokenLeaks(page, id);
        return leaks.length ? [{ target: blockTarget(page, id), evidence: `utils.getAuthToken is bound into ${leaks.join(', ')}` }] : [];
      });
      const inActions = liveActions(page)
        .filter(({ action }) => URL_OR_MESSAGE_ACTIONS.has(action.actionType) && AUTH_TOKEN.test(JSON.stringify(action.payload ?? {})))
        .map(({ target, action }) => ({ target, evidence: `utils.getAuthToken is bound into the payload of a ${action.actionType} action` }));
      return [...onBlocks, ...inActions];
    },
  },
  {
    id: 'never-bind-data-attribute-href',
    scope: 'app',
    run: app => htmlAttributeSites(app)
      .filter(site => runsOrOpens(site.key) && isBinding(site.value))
      .map(site => ({ page: site.page, target: site.target, evidence: `${site.path} binds data into "${site.key.trim()}"` })),
  },
  {
    // Statement by statement, so a minified script's unrelated `{{ }}` does not tie to a sink.
    id: 'eval-innerhtml-document-write-data',
    scope: 'app',
    run: app => customCodeSites(app).flatMap(site => {
      const statements = site.text.split(/[;\n]/u).filter(statement => HTML_OR_CODE_SINK.test(statement));
      const bound = statements.find(statement => statement.includes('{{'));
      const fromBrowser = statements.find(statement => BROWSER_INPUT.test(statement));
      const hit = bound ?? fromBrowser;
      if (!hit) return [];
      const sink = HTML_OR_CODE_SINK.exec(hit)[0].replace(/[\s(=+]+$/u, '');
      const source = bound ? 'a {{ }} binding' : `browser input (${BROWSER_INPUT.exec(hit)[0]})`;
      return [{ page: site.page, target: site.target, evidence: `${site.path} passes ${source} to ${sink}`, confidence: bound ? 'high' : 'medium' }];
    }),
  },
  {
    // Custom code is read here; key-token-password-shaped-value reads variables and functions, so one value is reported once.
    id: 'api-keys-tokens-secrets-head',
    scope: 'app',
    run: app => {
      const inCode = customCodeSites(app).flatMap(site => {
        const secrets = secretsIn(site.text);
        return secrets.length ? [{ page: site.page, target: site.target, evidence: `${site.path} holds ${secrets.join('; ')}`, confidence: 'medium' }] : [];
      });
      const inAttributes = htmlAttributeSites(app).flatMap(site => {
        if (typeof site.value !== 'string' || isBinding(site.value)) return [];
        const secrets = secretsIn(site.value, site.key);
        return secrets.length ? [{ page: site.page, target: site.target, evidence: `${site.path} holds ${secrets.join('; ')}`, confidence: 'medium' }] : [];
      });
      return [...inCode, ...inAttributes];
    },
  },
  {
    id: 'key-token-password-shaped-value',
    run: page => {
      const variables = Object.entries(page.variables).flatMap(([id, variable]) => {
        const value = variable?.initialValue;
        if (typeof value !== 'string' || isBinding(value)) return [];
        const secrets = secretsIn(value, variable?.name);
        return secrets.length ? [{ target: { kind: 'variable', id, name: variable?.name ?? id }, evidence: `pageVariables.${id}.initialValue holds ${secrets.join('; ')}`, confidence: 'medium' }] : [];
      });
      const functions = Object.entries(page.functions).flatMap(([id, pageFunction]) => {
        const secrets = secretsIn(pageFunction?.functionBody);
        return secrets.length ? [{ target: { kind: 'function', id, name: pageFunction?.name ?? id }, evidence: `pageFunctions.${id}.functionBody holds ${secrets.join('; ')}`, confidence: 'medium' }] : [];
      });
      return [...variables, ...functions];
    },
  },
];
