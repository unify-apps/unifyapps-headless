// What an ask is about, and which loop runs it. The generic commands (/ua:scope-loop, build-loop,
// repair-loop, test-loop, review-loop) sort the words after the command into a ticket, a design link,
// an entity or plain words (classifyRef), resolve an entity against the cache (decideTarget with
// the cache lookups), and get the specific loop to hand over to (commandFor). Pure, apart from the
// lookups the CLI passes in.
import { ua } from './blocks.mjs';
import { cliFailure } from './impact.mjs';
import { kindOf, platformOf } from './platform.mjs';
import { usage } from './output.mjs';

export const TARGETS = Object.freeze(['web-app', 'native-app', 'code-app', 'ai-agent', 'automation']);
export const VERBS = Object.freeze(['scope', 'build', 'fix', 'test', 'review']);
export const MODES = Object.freeze(['discover', 'build', 'run']);
// The older words for the first two modes, still accepted on the command line.
const MODE_ALIASES = Object.freeze({ design: 'discover', automate: 'build' });

/** Pure: a test mode as the router names it; an older word maps to its mode, anything else passes through. */
export function normalizeMode(mode) {
  return mode != null && Object.hasOwn(MODE_ALIASES, mode) ? MODE_ALIASES[mode] : mode;
}
// What the person is asked when nothing in the ask says what it is about.
// What Claude says an ask is about, from the front doors' table (references/which-loop.md). With a kind,
// the router reads no hint words: it finds the named thing in the cache and names the loop.
export const KINDS = Object.freeze(['app', 'automation', 'ai-agent', 'content', 'object', 'unknown']);
export const ASK_OPTIONS = Object.freeze(['web-app', 'native-app', 'ai-agent', 'automation']);

// A ticket number never starts with 0, so a test case id such as TC-01 is not a ticket.
const TICKET = /\b([A-Z][A-Z0-9]{1,9}-[1-9]\d{0,5})\b/u;
const FIGMA = /https?:\/\/(?:www\.)?figma\.com\/(?:design|file|proto|board|make)\/\S+/iu;
const APP_URL = /\/(?:interfaces|apps)\/([A-Za-z0-9_-]{6,})|\/agent-api\/preview\/b\/([A-Za-z0-9_-]{6,})/u;
const AGENT_URL = /\/(?:ai-agents?|agents)\/([A-Za-z0-9_-]{6,})/u;
const AUTOMATION_URL = /\/(?:automations?|workflows?)\/([A-Za-z0-9_-]{6,})/u;
const ENTITY_ID = /^e_[0-9a-f]{24}$/u;

// Words that say what a new thing is, when no entity is named. Each list is tried as whole words.
const HINTS = Object.freeze({
  'native-app': /\b(?:mobile|native|ios|android|iphone|ipad|app store|play store)\b/iu,
  'web-app': /\b(?:web ?app|website|web|portal|desktop|browser|site)\b/iu,
  'ai-agent': /\b(?:ai agents?|agents?|chatbots?|chat bots?|assistants?|copilots?|bots?)\b/iu,
  // Sending, notifying and timing words say an automation too: "send a daily summary to managers".
  automation: /\b(?:automations?|workflows?|scheduled jobs?|cron|webhooks?|integrations?|notify|notifications?|slack|daily|nightly|weekly|hourly|schedule[ds]?|sync|syncs)\b/iu,
});
// Test automation is a test loop's work, not an automation: "automation testing", "automated tests".
const TEST_AUTOMATION = /\b(?:automation test(?:ing|s)?|test automation|automated tests?|automate (?:the |these |all )?(?:test )?cases)\b/giu;
// An AI agent's own parts. They beat a screen word: "instructions for the copilot agent so it knows every page".
const AGENT_PARTS = /\b(?:instructions|system prompt|persona|knowledge base|guardrails)\b[^.]{0,40}\b(?:agents?|copilots?|assistants?|bots?)\b|\b(?:agents?|copilots?|assistants?|bots?)(?:'s)?\s+(?:instructions|system prompt|persona|knowledge base|guardrails)\b/iu;
// A deck or a video is content-loop's, whatever app or page it shows.
const CONTENT = /\b(?:decks?|presentations?|pitch|pptx?|powerpoint|keynote|\d+ slides)\b|\b(?:demo|walkthrough|explainer|product|promo|intro) videos?\b|\bvideos? (?:of|about|for|like|from|with)\b|\bmake (?:a |the |an? )?(?:full |short |new )?videos?\b/iu;

// Words that say the ask is about a screen of an app: a page and what sits on it. They beat a single
// hint word, so "add an agent name column to the tickets table" is the app's, not an AI agent's.
const SCREEN = /\b(?:pages?|screens?|tables?|columns?|buttons?|labels?|filters?|tabs?|forms?|cards?|modals?|dialogs?|popups?|dropdowns?|charts?|headers?|footers?|menus?|sidebars?|layouts?|icons?|banners?|tiles?|navbar|nav)\b/iu;
const OBJECT = /\bobjects?\b/iu;
// Words that say the ask changes an object itself, so it stays the object's even beside an automation word.
const FIELDS = /\b(?:fields?|records?|rows?|picklists?|columns? of)\b/iu;
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
/** Pure: whether a cached name sits in the text as whole words. Names under 3 letters never match. */
const namedIn = (text, name) => typeof name === 'string' && name.trim().length >= 3
  && new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegExp(name.trim())}(?:$|[^\\p{L}\\p{N}])`, 'iu').test(text);

/** Pure: the single target the words hint at, or null when none or more than one. */
export function hintOf(text) {
  const hits = hintsIn(text);
  return hits.length === 1 ? hits[0] : null;
}

/** Pure: every target the words hint at. */
function hintsIn(text) {
  const words = String(text ?? '').replace(TEST_AUTOMATION, ' ');
  return Object.entries(HINTS).filter(([, re]) => re.test(words)).map(([target]) => target);
}

/** Pure: what kind of reference the ask holds, and the value to resolve. */
export function classifyRef(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return { refKind: 'empty', value: null, hint: null };
  const ticket = TICKET.exec(raw);
  // Test case ids are not tickets: "automate cases TC-01 to TC-12".
  if (ticket && !/\bcases?\b[^.]{0,30}$/iu.test(raw.slice(0, ticket.index))) return { refKind: 'ticket', value: ticket[1], hint: hintOf(raw) };
  const figma = FIGMA.exec(raw);
  if (figma) return { refKind: 'design', value: figma[0], hint: hintOf(raw) };
  const app = APP_URL.exec(raw);
  if (app) return { refKind: 'app', value: app[1] ?? app[2], hint: null };
  const agent = AGENT_URL.exec(raw);
  if (agent) return { refKind: 'agent', value: agent[1], hint: null };
  const automation = AUTOMATION_URL.exec(raw);
  if (automation) return { refKind: 'automation', value: automation[1], hint: null };
  if (ENTITY_ID.test(raw)) return { refKind: 'id', value: raw, hint: null };
  return { refKind: 'words', value: raw, hint: hintOf(raw) };
}

const APP_TARGET = (app) => {
  const platform = platformOf(app?.type);
  if (!platform) return null;
  return platform === 'MOBILE' ? 'native-app' : kindOf(app?.mode) === 'code' ? 'code-app' : 'web-app';
};

// One family of specific loops per target: the prefix, the verbs it has, and whether scope on a thing that
// exists is one feature of it (the apps have feature-prd-loop; an agent's or an automation's scope loop
// extends it itself). An agent's tests are its evaluation, so it has the test loops; an automation is proven
// by the test runs of its build and fix loops and has none; neither has a critic. An app's test loops are
// named by the modes (discover, build, run), on WEB only; an agent's keep their own words, design and automate.
const FAMILIES = Object.freeze({
  'web-app': { prefix: 'app', feature: true, verbs: VERBS },
  'code-app': { prefix: 'app', feature: true, verbs: VERBS },
  'native-app': { prefix: 'native', feature: true, verbs: ['scope', 'build', 'fix', 'review'] },
  'ai-agent': { prefix: 'ai-agent', feature: false, verbs: ['scope', 'build', 'fix', 'test'], testNames: { discover: 'design', build: 'automate' } },
  automation: { prefix: 'automation', feature: false, verbs: ['scope', 'build', 'fix'] },
});
const NO_LOOP = Object.freeze({
  'native-app': { test: 'a mobile app has no test loops: its build and fix loops prove every page on a simulator' },
  'ai-agent': { review: 'an AI agent has no critic loop: its experiment scorecard is the review (/ua:ai-agent-run-test-loop)' },
  automation: { test: 'an automation has no test loops: its build and fix loops prove every acceptance line with a test run', review: 'an automation has no critic loop: its best-practice report is read in /ua:automation-fix-loop' },
});

/**
 * Pure: the specific loop for a verb on a target. `existing` says the ask names a thing that exists
 * (scope on an app then means one feature of it, unless `whole`); `mode` is test's discover | build | run
 * (design and automate are accepted for the first two). Answers { command, reason }: a command, or null
 * with the reason.
 */
export function commandFor(verb, target, { mode: rawMode = null, existing = false, whole = false } = {}) {
  const mode = normalizeMode(rawMode);
  if (!VERBS.includes(verb)) return { command: null, reason: `unknown verb ${verb}: one of ${VERBS.join(', ')}` };
  if (verb === 'test' && !MODES.includes(mode)) return { command: null, reason: `test needs a mode: ${MODES.join(', ')}` };
  // A ticket in a test run names a fix to verify: the signoff loop re-runs the cases the ticket holds.
  if (target === 'ticket' && verb === 'test' && mode === 'run') return { command: 'app-test-signoff-loop', reason: null };
  if (target === 'ticket') return { command: null, reason: 'read the ticket and name the thing it is about, then run target again with it' };
  if (target === 'content') return { command: 'content-loop', reason: null };
  if (target === 'object') return { command: null, reason: 'no loop builds an object yet: build it directly, through fde-agent' };
  const family = FAMILIES[target];
  if (!family) return { command: null, reason: 'unknown target: ask the person what it is about' };
  if (!family.verbs.includes(verb)) return { command: null, reason: NO_LOOP[target]?.[verb] ?? `no ${verb} loop for ${target}` };
  if (verb === 'scope' && existing && !whole && family.feature) return { command: 'feature-prd-loop', reason: null };
  const verbName = verb === 'test' ? `${family.testNames?.[mode] ?? mode}-test` : verb === 'review' ? 'design-critic' : verb;
  return { command: `${family.prefix}-${verbName}-loop`, reason: null };
}

/**
 * Resolves the ask to a target with the cache lookups the caller gives: each of app(token),
 * agent(token), automation(token) answers { id, name, type?, mode? } or null. An optional names()
 * answers what `entity context solution` holds ({ apps: [{ id, name, pages: [{ name }] }], objects,
 * agents, automations: [{ id, name }] }); with it, words that name no whole thing are read for the
 * names inside them (see byNames). Pure otherwise.
 */
export function decideTarget({ ref, verb, mode: rawMode = null, whole = false, lookups, kind = null, app: appName = null, isNew = false, platform = null }) {
  const mode = normalizeMode(rawMode);
  const sorted = classifyRef(ref);
  const base = { ref: sorted.value ?? String(ref ?? '').trim(), refKind: sorted.refKind, verb, mode, hint: sorted.hint, target: null, id: null, name: null, kind: null, existing: false, command: null, reason: null, ask: null };
  const done = (fields) => {
    const out = { ...base, ...fields };
    if (!out.command && !out.reason) {
      const pick = commandFor(verb, out.target, { mode, existing: out.existing, whole });
      out.command = pick.command;
      out.reason = pick.reason;
    }
    return out;
  };
  const fromApp = (app) => done({ target: APP_TARGET(app), id: app.id, name: app.name ?? null, kind: kindOf(app.mode), existing: true });
  const fromAgent = (agent) => done({ target: 'ai-agent', id: agent.id, name: agent.name ?? null, existing: true });
  const fromAutomation = (wf) => done({ target: 'automation', id: wf.id, name: wf.name ?? null, existing: true });
  const unknown = (text) => {
    const hint = sorted.hint;
    if (hint) return done({ target: hint, existing: false, reason: null });
    return done({ target: 'unknown', ask: [...ASK_OPTIONS], reason: `nothing in "${text}" says what it is about: ask the person` });
  };
  switch (sorted.refKind) {
    case 'empty': return done({ target: 'unknown', ask: [...ASK_OPTIONS], reason: 'the ask is empty: ask the person what it is about' });
    case 'ticket': {
      // A ticket in a test run goes to the signoff loop, which exists for web apps only: words that say
      // mobile keep the ticket unread until the loop names the app.
      const mobile = sorted.hint === 'native-app' && verb === 'test' && mode === 'run';
      return done({ target: 'ticket', ...(mobile ? { reason: 'a mobile app has no signoff loop: read the ticket and name the app, then run target again with it' } : {}) });
    }
    case 'design': return done({ target: 'design', reason: 'the frames belong to an app: name it (the one the ask names, else the solution\'s one app, else ask)' });
    case 'app': { const app = lookups.app(sorted.value); return app ? fromApp(app) : done({ target: 'unknown', ask: [...ASK_OPTIONS], reason: `app ${sorted.value} is not in the cache: run solution refresh, or name the app` }); }
    case 'agent': { const agent = lookups.agent(sorted.value); return agent ? fromAgent(agent) : done({ target: 'ai-agent', existing: false }); }
    case 'automation': { const wf = lookups.automation(sorted.value); return wf ? fromAutomation(wf) : done({ target: 'automation', existing: false }); }
    default: {
      if (kind) return byKind({ kind, text: sorted.value, appName, isNew, platform, lookups, done, fromApp, fromAgent, fromAutomation });
      if (CONTENT.test(sorted.value)) return done({ target: 'content' });
      const app = lookups.app(sorted.value);
      if (app) return fromApp(app);
      const agent = lookups.agent(sorted.value);
      if (agent) return fromAgent(agent);
      const wf = lookups.automation(sorted.value);
      if (wf) return fromAutomation(wf);
      if (lookups.names) {
        const found = byNames(sorted.value, lookups.names(), sorted.hint);
        // The names list carries no app type, so the app is read once more by id for it.
        if (found?.app) return fromApp(lookups.app(found.app.id) ?? found.app);
        if (found?.agent) return fromAgent(found.agent);
        if (found?.automation) return fromAutomation(found.automation);
        if (found?.object) return done({ target: 'object', id: found.object.id ?? null, name: found.object.name ?? null, existing: Boolean(found.object.id) });
        if (found?.ask) return done({ target: 'unknown', ask: [...ASK_OPTIONS], reason: found.ask });
      }
      return unknown(sorted.value);
    }
  }
}

/**
 * Pure: what the names inside a sentence say it is about, in this order. An app named in it; else the
 * one app holding a page named in it; else one agent or one automation named in it; else, when it
 * speaks of a screen, the solution's only app; else an object, named or called one; else, with no hint
 * word, the solution's only app. Answers { app | agent | automation | object } or { ask } (two apps
 * fit), or null when the names settle nothing and the hint words decide.
 */
/**
 * The kind Claude gave, settled against the cache. An app is the one named with --app, a new one with --new
 * (on --platform web or mobile), else the one app named in the ask or holding a page named in it, else the
 * solution's only app; an agent or automation is the one of that kind named in the ask, else a new one. When
 * the ask names an agent or automation of another kind, `check` says so, for Claude to read before it hands over.
 */
function byKind({ kind, text, appName, isNew, platform, lookups, done, fromApp, fromAgent, fromAutomation }) {
  const cached = lookups.names?.() ?? null;
  const names = cached ? namedThings(text, cached) : { apps: [], pageApps: [], agents: [], automations: [], objects: [] };
  const other = kind === 'content' ? null : [['ai-agent', names.agents], ['automation', names.automations]]
    .find(([itsKind, list]) => itsKind !== kind && list.length === 1);
  const check = other ? `the ask names the ${other[0] === 'ai-agent' ? 'AI agent' : 'automation'} "${other[1][0].name}", and it was passed as ${kind}` : null;
  const withCheck = (out) => (check ? { ...out, check } : out);
  const ask = (reason) => done({ target: 'unknown', ask: [...ASK_OPTIONS], reason });
  switch (kind) {
    case 'unknown': return ask('the ask could be about more than one kind of thing: ask the person');
    case 'content': return done({ target: 'content' });
    case 'object': {
      const object = names.objects.length === 1 ? names.objects[0] : null;
      return withCheck(done({ target: 'object', id: object?.id ?? null, name: object?.name ?? null, existing: Boolean(object) }));
    }
    case 'automation':
    case 'ai-agent': {
      const list = kind === 'ai-agent' ? names.agents : names.automations;
      if (list.length === 1) return withCheck(kind === 'ai-agent' ? fromAgent(list[0]) : fromAutomation(list[0]));
      return withCheck(done({ target: kind, existing: false }));
    }
    default: {
      if (isNew) return done({ target: platform === 'mobile' ? 'native-app' : 'web-app', existing: false });
      if (appName) {
        const app = lookups.app(appName);
        return app ? withCheck(fromApp(app)) : ask(`no cached app is named "${appName}": run solution refresh, or ask the person which app`);
      }
      const apps = cached?.apps ?? [];
      const pick = names.apps.length === 1 ? names.apps[0] : names.pageApps.length === 1 ? names.pageApps[0] : apps.length === 1 ? apps[0] : null;
      if (pick) return withCheck(fromApp(lookups.app(pick.id) ?? pick));
      return ask(apps.length ? `the solution has ${apps.length} apps and the ask does not say which: ask the person` : 'no app is cached: run solution refresh, or ask the person');
    }
  }
}

/**
 * Pure: every cached thing named in the text, by kind: { apps, pageApps (each app with a page named),
 * agents, automations, objects }. A name that sits inside a longer one also found loses to it:
 * "Car Accident || Show emergency 999 card" is that automation, not the page "Emergency".
 */
export function namedThings(text, cached) {
  const apps = cached?.apps ?? [];
  const pageName = (page) => (typeof page === 'string' ? page : page?.name);
  const found = [...apps.map((app) => app.name), ...apps.flatMap((app) => (app.pages ?? []).map(pageName)),
    ...['agents', 'automations', 'objects'].flatMap((kind) => (cached?.[kind] ?? []).map((entry) => entry.name))]
    .filter((name) => namedIn(text, name)).map((name) => name.trim().toLowerCase());
  const counts = (name) => {
    const key = String(name ?? '').trim().toLowerCase();
    return namedIn(text, name) && !found.some((other) => other.length > key.length && other.includes(key));
  };
  const named = (list) => (list ?? []).filter((entry) => counts(entry.name));
  return { apps: named(apps), pageApps: apps.filter((app) => (app.pages ?? []).some((page) => counts(pageName(page)))),
    agents: named(cached?.agents), automations: named(cached?.automations), objects: named(cached?.objects) };
}

export function byNames(text, cached, hint = null) {
  const apps = cached?.apps ?? [];
  const names = namedThings(text, cached);
  const namedApps = names.apps;
  if (namedApps.length === 1) return { app: namedApps[0] };
  // A named agent or automation beats a page whose name sits in the same ask: "datasets for the
  // Support agent" is that agent, not the page "Chat" the datasets are named after.
  const { agents, automations } = names;
  if (agents.length === 1 && !automations.length) return { agent: agents[0] };
  if (automations.length === 1 && !agents.length) return { automation: automations[0] };
  // A page name used for an agent or an automation is not the page: "plan the leave automation".
  const agentOrAutomation = (hint === 'automation' || hint === 'ai-agent') && !SCREEN.test(text);
  const pageApps = agentOrAutomation ? [] : names.pageApps;
  if (pageApps.length === 1) return { app: pageApps[0] };
  if (pageApps.length > 1) return { ask: `more than one app has a page named in "${text}" (${pageApps.map((app) => app.name ?? app.id).join(', ')}): ask the person which app` };
  const onlyApp = apps.length === 1 ? apps[0] : null;
  if (AGENT_PARTS.test(text)) return null;
  if (SCREEN.test(text)) return onlyApp ? { app: onlyApp } : apps.length ? { ask: `"${text}" is about a screen, and the solution has ${apps.length} apps: ask the person which app` } : null;
  // An automation or an agent that acts on an object is that automation or agent, not the object:
  // "when a ticket is closed, notify the owner".
  if ((hint === 'automation' || hint === 'ai-agent') && !FIELDS.test(text)) return null;
  const { objects } = names;
  if (objects.length === 1) return { object: objects[0] };
  if (OBJECT.test(text)) return { object: { id: null, name: null } };
  // Words that hint at two things say two things: ask, rather than take the only app.
  if (!hint && onlyApp && !hintsIn(text).length) return { app: onlyApp };
  return null;
}

/** One line for a person: what it is about and which loop runs. */
export function renderTarget(t) {
  const who = t.name || t.id ? `${t.name ?? '(unnamed)'}${t.id ? ` [${t.id}]` : ''}: ` : '';
  const what = t.target === 'code-app' ? 'web-app (code app)' : t.target;
  // A test loop's own word for the mode (an agent's loops say design and automate), else the mode as asked.
  const stage = t.mode ? (/-([a-z]+)-test-loop$/u.exec(t.command ?? '')?.[1] ?? t.mode) : null;
  const run = t.command ? ` → /ua:${t.command}${stage ? ` (${stage})` : ''}` : t.reason ? ` → ${t.reason}` : '';
  return `${who}${what}${run}`;
}

// A cache answer that is a plain miss or an unknown name is "not found"; anything else is a failure.
const notFound = (result) => result.json?.cache?.status === 'miss' || result.json?.error?.code === 'USAGE';

/**
 * The cache lookups for the CLI: one `ua cache app|agent|wf <token>` each, in the solution folder,
 * and names(): every cached name at once, from `ua entity context solution`. A names() read that
 * fails answers no names, so the router falls back to the hint words rather than stopping.
 */
export function cacheLookups({ solution, session }) {
  let solutionNames;
  const names = () => {
    if (solutionNames !== undefined) return solutionNames;
    const result = ua(['entity', 'context', 'solution'], { cwd: solution, session });
    const cache = result.status === 0 ? result.json?.cache : null;
    solutionNames = cache?.status === 'hit'
      ? { apps: cache.apps ?? [], objects: cache.objects ?? [], agents: cache.agents ?? [], automations: cache.automations ?? [] }
      : null;
    return solutionNames;
  };
  const read = (args, pick) => {
    const result = ua(['cache', ...args], { cwd: solution, session });
    if (result.status === 0 && !result.json?.error) return pick(result.json) ?? null;
    if (notFound(result)) return null;
    throw cliFailure(result, `cache ${args.join(' ')}`);
  };
  return {
    names,
    app: (token) => read(['app', token], (json) => (json?.app?.id ? { id: json.app.id, name: json.app.name ?? null, type: json.app.type ?? null, mode: json.app.mode ?? null } : null)),
    agent: (token) => read(['agent', token], (json) => (json?.agent ? { id: json.agent.id ?? token, name: json.agent.name ?? null } : null)),
    automation: (token) => read(['wf', token], (json) => (json?.automation ? { id: json.automation.id ?? token, name: json.automation.name ?? null } : null)),
  };
}

/** The `target` command: `loops target <ask...> --verb <verb> [--mode m] [--whole]`. */
export function resolveTarget({ ask, verb, mode = null, whole = false, kind = null, app = null, isNew = false, platform = null, solution, session }) {
  if (!ask || !String(ask).trim()) throw usage('target needs the ask: target "<words, ticket, link, app or agent>" --verb <scope|build|fix|test|review>');
  if (!VERBS.includes(verb)) throw usage(`target needs --verb, one of ${VERBS.join(', ')}`);
  if (mode && !MODES.includes(normalizeMode(mode))) throw usage(`--mode must be one of ${MODES.join(', ')}`);
  if (kind && !KINDS.includes(kind)) throw usage(`--kind must be one of ${KINDS.join(', ')}`);
  if (platform && !['web', 'mobile'].includes(platform)) throw usage('--platform must be web or mobile');
  if ((app || isNew || platform) && kind !== 'app') throw usage('--app, --new and --platform go with --kind app');
  const data = decideTarget({ ref: ask, verb, mode, whole, kind, app, isNew, platform, lookups: cacheLookups({ solution, session }) });
  return { data, text: renderTarget(data) };
}
