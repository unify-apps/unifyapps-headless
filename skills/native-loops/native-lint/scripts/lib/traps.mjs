// Known traps T01–T24 (../../references/known-traps.md) as detectors over a
// task body, a tasks JSON array or a builder brief. A detector is a few lines on purpose:
// it names the trap and the line, the rewrite says what to send instead. A trap applies
// only while the installed versions are older than what retires it, and only on its platforms.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loopsHome } from '../../../native-device-pool/scripts/lib/home.mjs';

const ID_PREFIX = /^(?:b|evt|act|var|func|fd|e|nav|ds|f|q|t)_/u;
const SNAKE = /^[a-z0-9]+(?:_[a-z0-9]+)+$/u;
const camel = (name) => name.replace(/_+([a-z0-9])/gu, (_, char) => char.toUpperCase());

function byLine(text, regex, map = () => ({})) {
  const findings = [];
  String(text ?? '').split(/\r?\n/u).forEach((lineText, index) => {
    const match = regex.exec(lineText);
    if (match) findings.push({ line: index + 1, excerpt: lineText.trim().slice(0, 120), ...map(match, lineText) });
  });
  return findings;
}
const lineAt = (text, offset) => text.slice(0, offset).split(/\r?\n/u).length;
const excerptAt = (text, offset) => text.split(/\r?\n/u)[lineAt(text, offset) - 1].trim().slice(0, 120);
const has = (text, regex) => regex.test(String(text ?? ''));

// `installed` is { uaVersion, platformPrs } from readInstalled().
const prNumber = (ref) => String(ref ?? '').replace(/^#/u, '').trim();
function versionGte(installed, wanted) {
  if (!installed) return false;
  const parse = (value) => String(value).match(/\d+(?:\.\d+)*/u)?.[0].split('.').map(Number) ?? null;
  const [left, right] = [parse(installed), parse(wanted)];
  if (!left || !right) return false;
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff) return diff > 0;
  }
  return true;
}
const prMerged = (installed, pr) => (installed?.platformPrs ?? []).map(prNumber).includes(prNumber(pr));

// T24: the page tasks of one page in a tasks array, matched by entity id, else by name.
const PAGE_KINDS = new Set(['page-layout', 'page-bind']);
const READS_SOURCE = /(?<!\bno )\bdata ?sources?\b|\bdataSources?\b|\brunQueryOnPageLoad\b|\['data'\]/iu;
const NAMES_LOADING = /(?<!\bno )\bloading states?\b|(?<!\bno )\bskeletons?\b|\bCONTENT Loaders?\b/iu;
const taskText = (task) => `${task?.title ?? ''}\n${Array.isArray(task?.body) ? task.body.join('\n') : task?.body ?? ''}`;
const samePage = (left, right) => {
  if (left?.kind !== 'page' || right?.kind !== 'page') return false;
  if (left.id && right.id) return String(left.id) === String(right.id);
  const name = (entity) => String(entity?.name ?? '').trim().replace(/\s+/gu, ' ').toLowerCase();
  return !!name(left) && name(left) === name(right);
};

// The platforms a trap holds on. A trap about the phone (the mobile renderer's blocks, Pressable, the
// Preview app, argent, native custom styles, navigator and transitions) is MOBILE only; a trap
// about a tool's contract, bindings, data sources, loading states, naming or plan shape holds
// on WEB too. When in doubt a trap stays MOBILE: skipped on WEB it is a missed warning, wrong
// on WEB it is a false refusal.
const MOBILE_ONLY = Object.freeze(['MOBILE']);
const BOTH = Object.freeze(['MOBILE', 'WEB']);
export const PLATFORMS = BOTH;

export const TRAPS = [
  { id: 'T01', title: 'A Module block takes only its own events; onNavigate/onClick on a Module are refused', blocking: true, platforms: MOBILE_ONLY, retiredBy: null,
    rewrite: 'put the event on the block inside the module, or on the page',
    detect: ({ text }) => byLine(text, /\bModule\b(?=.*\b(?:onClick|onPress|onNavigate|onLongPress)\b)|\b(?:onClick|onPress|onNavigate|onLongPress)\b(?=.*\bModule\b)/u, () => ({ detail: 'an event a Module does not take' })) },
  { id: 'T02', title: 'apply_page_edits ops are set and unset only; update_blocks takes edits, not updates', blocking: true, platforms: BOTH, retiredBy: null, fixable: true,
    rewrite: 'use set/unset; rename the key to edits',
    detect: ({ text }) => [
      ...(has(text, /\bupdate_blocks\b/u) ? byLine(text, /(?:^|[^\w])["']?updates["']?\s*[:=]/u, () => ({ detail: 'the key updates on update_blocks' })) : []),
      ...byLine(text, /["']op["']\s*:\s*["'](?!set["']|unset["'])[a-z_]+["']/u, () => ({ detail: 'an apply_page_edits op that is not set or unset' })),
    ] },
  { id: 'T03', title: 'appearance.interactions on a Pressable is refused by update_blocks', blocking: true, platforms: MOBILE_ONLY, retiredBy: { platform: '#31453' },
    rewrite: 'set it at create_block time, or recreate the block',
    detect: ({ text }) => byLine(text, /appearance\.interactions/u, () => ({ detail: 'appearance.interactions in an update' }))
      .filter((finding) => !/\bcreate(?:_block)?\b/iu.test(finding.excerpt) && (has(text, /\bupdate_blocks\b/u) || /\b(?:update|set|patch|change)\b/iu.test(finding.excerpt))) },
  { id: 'T04', title: 'TextInput label add-on accepts color, variant, weight only; lineHeight/letterSpacing are refused', blocking: true, platforms: MOBILE_ONLY, retiredBy: { platform: '#31453' },
    rewrite: 'drop lineHeight/letterSpacing from the label add-on, or wait for the platform deploy',
    detect: ({ text }) => byLine(text, /addOns?\.label\b.*\b(?:lineHeight|letterSpacing)\b|\blabel add-?on\b.*\b(?:lineHeight|letterSpacing)\b/iu, () => ({ detail: 'lineHeight or letterSpacing on the label add-on' })) },
  { id: 'T05', title: 'removeActionIds wants act_ ids; plans and caches show evt_ ids', blocking: true, platforms: BOTH, retiredBy: null,
    rewrite: "read the block's events live and map each evt_ to its act_ id",
    detect: ({ text }) => {
      const findings = [];
      const source = String(text ?? '');
      for (const key of source.matchAll(/removeActionIds/gu)) {
        const window = source.slice(key.index, key.index + 240);
        for (const id of window.matchAll(/evt_[A-Za-z0-9]+/gu)) {
          const offset = key.index + id.index;
          findings.push({ line: lineAt(source, offset), excerpt: excerptAt(source, offset), detail: `${id[0]} in removeActionIds` });
        }
      }
      return findings;
    } },
  { id: 'T06', title: 'create_block camelCases a snake_case displayName with a misleading warning', blocking: true, platforms: BOTH, retiredBy: null, fixable: true,
    rewrite: 'name blocks in camelCase up front; read the name back',
    detect: ({ text }) => [
      ...byLine(text, /displayName["']?\s*[:=]\s*["'`]([a-z0-9]+(?:_[a-z0-9]+)+)["'`]/u, (match) => ({ detail: `snake_case displayName ${match[1]}`, suggestion: camel(match[1]) })),
      ...byLine(text, /\bcreate_block\b/u).filter((finding) => !/displayName["']?\s*[:=]/u.test(finding.excerpt)).flatMap((finding) => [...finding.excerpt.matchAll(/["'`]([a-z0-9]+(?:_[a-z0-9]+)+)["'`]/gu)]
        .map((match) => match[1]).filter((name) => SNAKE.test(name) && !ID_PREFIX.test(name))
        .map((name) => ({ ...finding, detail: `snake_case name ${name} on create_block`, suggestion: camel(name) }))),
    ] },
  { id: 'T07', title: 'Folder and data-source names are unique app-wide, not per page', blocking: false, platforms: BOTH, retiredBy: null,
    rewrite: 'check cache keys / cache ds across the app first; qualify the name',
    detect: ({ text }) => byLine(text, /\b(?:folder|data ?source)\b.*["'`](constants|validation|helpers|config|utils)["'`]/iu, (match) => ({ detail: `the generic name ${match[1]}` })) },
  { id: 'T08', title: 'A boolean initialValue on a page variable returns an opaque HTTP 500', blocking: true, platforms: BOTH, retiredBy: null, fixable: true,
    rewrite: 'write the string "true"/"false" or the value the sheet names',
    detect: ({ text }) => byLine(text, /initialValue["']?\s*[:=]\s*(true|false)\b/u, (match) => ({ detail: `initialValue ${match[1]} as a JSON boolean`, suggestion: `"${match[1]}"` })) },
  { id: 'T09', title: 'A MOBILE page reads native/blocks/<x> sheets; the write gate may still demand the web blocks/<x> sheet', blocking: false, platforms: MOBILE_ONLY, retiredBy: null,
    rewrite: 'read both sheets in the first knowledge read',
    detect: ({ text }) => {
      const source = String(text ?? '');
      const seen = new Set();
      const findings = [];
      for (const match of source.matchAll(/native\/blocks\/([A-Za-z0-9-]+)/gu)) {
        if (seen.has(match[1])) continue;
        seen.add(match[1]);
        if (!new RegExp(`(?<![\\w/])blocks/${match[1]}\\b`, 'u').test(source)) findings.push({ line: lineAt(source, match.index), excerpt: excerptAt(source, match.index), detail: `native/blocks/${match[1]} named without blocks/${match[1]}` });
      }
      return findings;
    } },
  { id: 'T10', title: 'A mobile TextInput is seeded with the web styles.maxWidth 50%', blocking: false, platforms: MOBILE_ONLY, retiredBy: null,
    rewrite: 'read back and strip maxWidth; keep width w-full',
    detect: ({ text }) => (has(text, /maxWidth/u) ? [] : byLine(text, /\bTextInput\b(?=.*\b(?:create_block|create|add|new)\b)|\b(?:create_block|create|add|new)\b(?=.*\bTextInput\b)/iu, () => ({ detail: 'a new TextInput with no maxWidth read-back' }))) },
  { id: 'T11', title: 'runBehaviour and isPublic have no read-back on any tool', blocking: true, platforms: BOTH, retiredBy: null,
    rewrite: 'mark them unverified up front with the raw entity read as the only check',
    detect: ({ text, part }) => byLine(text, /\b(runBehaviour|isPublic)\b/u, (match) => ({ detail: `${match[1]} promised in a read-back` }))
      .filter((finding) => part === 'proof' || /\b(?:read[- ]?back|proof|verif|shows|confirm)/iu.test(finding.excerpt)) },
  { id: 'T12', title: 'Standard objects (e_interface, e_component) refuse apply_record_edits', blocking: true, platforms: BOTH, retiredBy: null,
    rewrite: 'use the surface tool (update_app_settings, page settings)',
    detect: ({ text }) => byLine(text, /apply_record_edits(?=.*\b(?:e_interface|e_component)\b)|\b(?:e_interface|e_component)\b(?=.*apply_record_edits)/u, () => ({ detail: 'apply_record_edits on a standard object' })) },
  { id: 'T13', title: 'update_event_actions replace_all mints new action ids and breaks references', blocking: true, platforms: BOTH, retiredBy: null,
    rewrite: 'edit one action by id; never replace all',
    detect: ({ text }) => byLine(text, /\breplace_all\b/u, () => ({ detail: 'replace_all on event actions' })) },
  { id: 'T14', title: 'A knowledge sheet id the tenant does not serve answers notFound', blocking: false, platforms: BOTH, retiredBy: null,
    rewrite: 'check the sheet list (get_app_builder_knowledge_map) first; name only served sheets',
    detect: ({ text }) => {
      const source = String(text ?? '');
      const sheets = [...new Set([...source.matchAll(/(?<![\w/])((?:native\/)?(?:blocks|actions|concepts|context)\/[A-Za-z0-9-]+(?:\/[A-Za-z0-9-]+)*)/gu)].map((match) => match[1]))];
      if (!sheets.length) return [];
      const first = source.search(/(?<![\w/])(?:native\/)?(?:blocks|actions|concepts|context)\//u);
      return [{ line: lineAt(source, first), excerpt: excerptAt(source, first), detail: `sheets named: ${sheets.join(', ')}` }];
    } },
  { id: 'T15', title: 'A changed asset keeps its old picture when the URL is reused (no cache TTL on the phone or CDN)', blocking: true, platforms: BOTH, retiredBy: null,
    rewrite: 'every changed asset gets a new file name (content hash)',
    detect: ({ text }) => byLine(text, /\b(?:re-?upload|upload|replace)\b.*\b(?:same|existing|reus\w*|overwrit\w*)\b.*\b(?:file ?name|name|url|link|path)\b/iu, () => ({ detail: 'an upload that reuses a file name or URL' })) },
  { id: 'T16', title: "A page's cache entry can be a stale hit after edits outside UnifyApps Headless", blocking: false, platforms: BOTH, retiredBy: null,
    rewrite: 'cache page --refresh before the write; compare versions',
    detect: ({ text }, installed) => {
      if (!has(text, /\b(?:update_blocks|apply_page_edits|create_block|update_event_actions|apply_record_edits)\b/u) || has(text, /--refresh|\bversion\b/u)) return [];
      // The alphabetical child order of `cache outline` is fixed from UnifyApps Headless 3.50.0; the stale-hit part has no fix.
      const order = versionGte(installed?.uaVersion, '3.50.0') ? '' : '; child order in cache outline may be alphabetical';
      return byLine(text, /\bcache (?:outline|blocks|page|ds|events|keys|deps)\b/u, () => ({ detail: `a write built on a cache read must send its version (expectedVersions) or the save can wipe out a newer change${order}` }));
    } },
  { id: 'T17', title: 'Builders have no argent MCP tools; ToolSearch argent finds nothing', blocking: true, platforms: MOBILE_ONLY, retiredBy: null,
    rewrite: "brief `argent run <tool> --args '{json}'` from Bash with the reserved device id",
    detect: ({ text }) => byLine(text, /mcp__argent__([\w-]+)/u, (match) => ({ detail: `mcp__argent__${match[1]} in a builder brief` })) },
  { id: 'T18', title: 'Claude Code auto mode refuses deploy_workflow from a builder as a production deploy on UAT', blocking: false, platforms: BOTH, retiredBy: null,
    rewrite: 'run the deploy from the main session, or ask the person for the permission rule once',
    detect: ({ text, task, part }) => (task?.kind === 'deploy' ? (part === 'body' ? [{ line: 1, excerpt: `kind: deploy (${task.title ?? task.id})`, detail: 'a deploy task sent to a builder' }] : [])
      : byLine(text, /\bdeploy_workflow\b/u, () => ({ detail: 'deploy_workflow from a builder' }))) },
  { id: 'T19', title: 'The loops never publish the app: the Preview app runs drafts, and a source that answers forbidden datasource is reported, not published', blocking: false, platforms: MOBILE_ONLY, retiredBy: null,
    rewrite: 'check the source on the Preview app, on its draft; if it answers forbidden datasource, record the check as not proven with that reason and leave the publish to the person',
    detect: ({ text }) => (!has(text, /\bdata ?sources?\b|\bdataSource/iu) ? []
      : byLine(text, /\bpublish(?:_app)?\b(?! approval)/iu, () => ({ detail: 'a brief that publishes the app to check a data source' })).slice(0, 1)) },
  { id: 'T20', title: 'describe_callable_workflow returns inputs only; the STOP output is readable only through inspect_workflow_run', blocking: true, platforms: BOTH, retiredBy: null,
    rewrite: "read the run's STOP node with inspect_workflow_run and node ids",
    detect: ({ text }) => byLine(text, /\bdescribe_callable_workflow\b/u, () => ({ detail: 'an output proof that reads the callable description' })) },
  { id: 'T21', title: 'PinInput code length (5 vs 6) and other spec facts were guessed', blocking: true, platforms: BOTH, retiredBy: null,
    rewrite: 'ask once; never pick a length',
    detect: ({ text }) => (has(text, /\b[4-8]\b[^\n]{0,20}\b(?:digits?|chars?|characters|code length|length)\b|\b(?:length|digits?)\b[^\n]{0,12}\b[4-8]\b/iu) ? []
      : byLine(text, /\bPinInput\b/u, () => ({ detail: 'a PinInput with no stated code length' })).slice(0, 1)) },
  { id: 'T22', title: 'update_page_settings cannot write page transitions or navigator type', blocking: true, platforms: MOBILE_ONLY, retiredBy: null,
    rewrite: 'route to the main session or the builder UI as a manual step',
    // Platform PR #31453 adds the transition write; navigatorType stays a manual step after it.
    detect: ({ text }, installed) => byLine(text, prMerged(installed, '#31453') ? /\b(navigatorType)\b/u : /\b(pageTransitionBehavior|navigatorType)\b/u, (match) => ({ detail: `${match[1]} written through a builder` })) },
  { id: 'T23', title: 'A {{ }} expression inside native custom style JSON is not evaluated on the phone (device trap D01)', blocking: true, platforms: MOBILE_ONLY, retiredBy: null,
    rewrite: 'literal values per state (one block per state, shown by condition), or an appearance property the block sheet says takes a binding',
    // A line that warns against it ("never an expression inside custom style") is not a finding.
    detect: ({ text }) => byLine(text, /\b(?:customStyles|customCSS|custom ?(?:CSS|styles?))\b[^\n]*\{\{|\{\{[^\n]*\}\}[^\n]*\b(?:customStyles|customCSS)\b/iu, () => ({ detail: 'an expression inside native custom style JSON' }))
      .filter((finding) => !/\b(?:never|not|no|don't|avoid)\b/iu.test(finding.excerpt)) },
  { id: 'T24', title: 'A page built with a data source and no task for its loading states shows blank regions and jumps when the data lands: the design has no loading frame, so no builder adds a skeleton', blocking: true, platforms: BOTH, retiredBy: null,
    rewrite: "add the page's loading-states page-bind task after its bind task (native-loading-states references/plan.md § 5), or put the loading states in the page-bind that adds the source",
    // Reported once per page, on its first page-bind that reads a source, when the same tasks file lays the page out.
    detect: ({ task, tasks, part }) => {
      if (part !== 'body' || task?.kind !== 'page-bind' || !Array.isArray(tasks)) return [];
      const page = tasks.filter((other) => PAGE_KINDS.has(other?.kind) && samePage(other.entity, task.entity));
      const reader = page.find((other) => other.kind === 'page-bind' && READS_SOURCE.test(taskText(other)));
      if (reader !== task || !page.some((other) => other.kind === 'page-layout') || page.some((other) => NAMES_LOADING.test(taskText(other)))) return [];
      return [{ line: 1, excerpt: String(task.title ?? task.id).slice(0, 120), detail: `${task.entity.name} reads a data source and no task on it names its loading states` }];
    } },
];

/** A trap applies until every version that retires it is installed. */
export function applies(trap, installed) {
  if (!trap.retiredBy) return true;
  const conditions = [];
  if (trap.retiredBy.ua) conditions.push(versionGte(installed?.uaVersion, trap.retiredBy.ua));
  if (trap.retiredBy.platform) conditions.push(prMerged(installed, trap.retiredBy.platform));
  return !conditions.length || !conditions.every(Boolean);
}

/** The version of the UnifyApps Headless plugin these scripts ship in (scripts/lib → scripts → native-lint → skills → root). */
export function ownPluginVersion(root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..')) {
  try { return JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8')).version ?? null; } catch { return null; }
}

/**
 * What is installed: UnifyApps Headless is the plugin these scripts ship in (its version, unless the loops config
 * pins `ua.version`), and `known.platformPrs` of LOOPS_HOME/config.json lists the platform PRs that are live.
 * With neither, nothing is known and every trap applies.
 */
export function readInstalled(file = null, { pluginVersion = ownPluginVersion() } = {}) {
  const target = file ?? path.join(loopsHome(), 'config.json');
  let json = null;
  try { json = JSON.parse(fs.readFileSync(target, 'utf8')); } catch { return { uaVersion: pluginVersion, platformPrs: [], source: null }; }
  return { uaVersion: json?.ua?.version ?? pluginVersion, platformPrs: Array.isArray(json?.known?.platformPrs) ? json.known.platformPrs.map(String) : [], source: target };
}

/** One subject per task body and proof of a tasks array, or one for a brief. */
export function subjectsOf(input) {
  if (Array.isArray(input)) {
    return input.flatMap((task) => {
      const body = Array.isArray(task?.body) ? task.body.join('\n') : task?.body;
      return [{ taskId: task?.id ?? '?', part: 'body', text: String(body ?? ''), task, tasks: input }, { taskId: task?.id ?? '?', part: 'proof', text: String(task?.proof ?? ''), task, tasks: input }];
    });
  }
  return [{ taskId: null, part: 'brief', text: String(input ?? ''), task: null }];
}

/** Whether a trap holds on a platform (MOBILE or WEB); no platform means every trap. */
export const onPlatform = (trap, platform = null) => !platform || trap.platforms.includes(platform);

export function lintTraps(input, installed, { only = null, platform = null } = {}) {
  const findings = [];
  const retired = TRAPS.filter((trap) => !applies(trap, installed)).map((trap) => trap.id);
  for (const trap of TRAPS) {
    if (retired.includes(trap.id) || (only && !only.includes(trap.id)) || !onPlatform(trap, platform)) continue;
    for (const subject of subjectsOf(input)) {
      for (const hit of trap.detect(subject, installed)) {
        findings.push({ trap: trap.id, blocking: trap.blocking, taskId: subject.taskId, part: subject.part, line: hit.line, excerpt: hit.excerpt,
          detail: hit.detail, rewrite: trap.rewrite, fixable: Boolean(trap.fixable), suggestion: hit.suggestion ?? null });
      }
    }
  }
  return { findings, retired };
}

/** The safe rewrites only: camelCase names (T06), updates → edits (T02), boolean initialValue → string (T08). */
export function applyFixes(text) {
  const applied = [];
  let out = String(text ?? '');
  const count = (id, before, after) => { if (before !== after) applied.push(id); return after; };
  if (/\bupdate_blocks\b/u.test(out)) out = count('T02', out, out.replace(/(^|[^\w])(["']?)updates(["']?)(\s*[:=])/gu, '$1$2edits$3$4'));
  out = count('T06', out, out.replace(/(displayName["']?\s*[:=]\s*["'`])([a-z0-9]+(?:_[a-z0-9]+)+)(["'`])/gu, (_, head, name, tail) => `${head}${camel(name)}${tail}`));
  out = count('T06', out, out.replace(/^(.*\bcreate_block\b.*)$/gmu, (line) => line.replace(/(["'`])([a-z0-9]+(?:_[a-z0-9]+)+)(["'`])/gu, (whole, open, name, close) => (ID_PREFIX.test(name) ? whole : `${open}${camel(name)}${close}`))));
  out = count('T08', out, out.replace(/(initialValue["']?\s*[:=]\s*)(true|false)\b/gu, '$1"$2"'));
  return { text: out, applied: [...new Set(applied)] };
}
