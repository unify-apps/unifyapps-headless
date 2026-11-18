/**
 * source-graph.mjs — what a code app checkout holds: its files, which file imports which, and
 * the routes its router declares, and from those the pages a changed file reaches.
 * Imported by affected.mjs; never run on its own. Reads files under the checkout only: no
 * network, no writes.
 */
import fs from 'node:fs';
import path from 'node:path';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.vite', '.turbo', 'coverage']);
const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
// Tried in this order when an import names no extension, the order Vite resolves them in.
const RESOLVE_EXTENSIONS = [...CODE_EXTENSIONS, '.json', '.css', '.scss'];
const PARSED_EXTENSIONS = new Set([...CODE_EXTENSIONS, '.css', '.scss']);
const SHELL_FILES = /^src\/main\.(tsx|ts|jsx|js)$/u;

// Files every page is built with. A change to one reaches every route, so every case runs.
const GLOBAL_FILES = [
  /^package\.json$/u,
  /^(bun\.lockb?|package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/u,
  /^vite\.config\.[cm]?[jt]s$/u,
  /^tsconfig(\.[\w-]+)?\.json$/u,
  /^(tailwind|postcss)\.config\.[cm]?[jt]s$/u,
  /^index\.html$/u,
  /^components\.json$/u,
  /^\.env(\.[\w-]+)?$/u,
  /^public\//u,
  /^src\/index\.css$/u,
];
// Outside the app folder, only a hosting config changes what the preview serves.
const GLOBAL_REPO_FILES = [/(^|\/)vercel\.json$/u];
// Never part of what a browser loads.
const NO_UI_FILES = [/\.mdx?$/u, /(^|\/)__tests__\//u, /\.(test|spec)\.[cm]?[jt]sx?$/u, /^\.agents\//u, /^\.github\//u, /(^|\/)(LICENSE|CODEOWNERS)$/u];
// A data file can be read without an import (a glob, a fetch), so the graph cannot see who uses it.
const DATA_EXTENSIONS = new Set(['.json', '.yaml', '.yml']);

const posix = (file) => file.split(path.sep).join('/');
const lineOf = (text, index) => text.slice(0, index).split('\n').length;
const squash = (text) => text.replace(/\s+/gu, ' ').trim();

export function listFiles(root) {
  const files = [];
  const walk = (rel) => {
    for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(path.join(rel, entry.name));
      } else if (entry.isFile()) {
        files.push(posix(path.join(rel, entry.name)));
      }
    }
  };
  walk('');
  return files.sort();
}

/** `app` when the checkout keeps the app in an `app/` folder (Code Builder's layout), else the root. */
export function appDirOf(fileSet) {
  if (fileSet.has('app/package.json')) return 'app';
  return '';
}

const inApp = (appDir, file) => (appDir ? (file.startsWith(`${appDir}/`) ? file.slice(appDir.length + 1) : null) : file);
const fromApp = (appDir, rel) => (appDir ? `${appDir}/${rel}` : rel);

/** JSON with comments and trailing commas, as tsconfig files are written. */
export function parseJsonc(text) {
  let out = '';
  let quote = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      out += char;
      if (char === '\\') {
        out += text[index + 1] ?? '';
        index += 1;
      } else if (char === '"') quote = false;
    } else if (char === '"') {
      quote = true;
      out += char;
    } else if (char === '/' && text[index + 1] === '/') {
      while (index < text.length && text[index] !== '\n') index += 1;
      out += '\n';
    } else if (char === '/' && text[index + 1] === '*') {
      index = text.indexOf('*/', index + 2);
      if (index < 0) break;
      index += 1;
    } else out += char;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/gu, '$1'));
}

/** Import aliases from the app's tsconfig `paths`, plus `@/` → `src/` when none is declared. */
export function aliasesOf(root, appDir, fileSet) {
  const aliases = [];
  for (const name of ['tsconfig.json', 'tsconfig.app.json']) {
    const file = fromApp(appDir, name);
    if (!fileSet.has(file)) continue;
    let options;
    try {
      options = parseJsonc(fs.readFileSync(path.join(root, file), 'utf8')).compilerOptions ?? {};
    } catch {
      continue;
    }
    const base = path.posix.join(path.posix.dirname(file), options.baseUrl ?? '.');
    for (const [key, targets] of Object.entries(options.paths ?? {})) {
      const target = Array.isArray(targets) ? targets[0] : null;
      if (typeof target !== 'string') continue;
      const wildcard = key.endsWith('*');
      aliases.push({
        prefix: wildcard ? key.slice(0, -1) : key,
        wildcard,
        target: path.posix.normalize(path.posix.join(base, wildcard ? target.replace(/\*$/u, '') : target)),
      });
    }
  }
  if (!aliases.some((alias) => alias.prefix === '@/')) aliases.push({ prefix: '@/', wildcard: true, target: fromApp(appDir, 'src/') });
  return aliases.sort((left, right) => right.prefix.length - left.prefix.length);
}

const IMPORT_FROM = /\b(?:import|export)\s+(?:type\s+)?([\w$*{}\s,]*?)\s*from\s*['"]([^'"]+)['"]/gu;
const IMPORT_BARE = /\bimport\s*['"]([^'"]+)['"]/gu;
const IMPORT_CALL = /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/gu;
const CSS_IMPORT = /@import\s+(?:url\(\s*)?['"]([^'"]+)['"]/gu;
const GLOB_CALL = /import\.meta\.glob\s*\(\s*(\[[^\]]*\]|['"][^'"]+['"])/gu;
const LAZY_DECLARATION = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[\w$.]*\(\s*\(\s*\)\s*=>\s*import\(\s*['"]([^'"]+)['"]\s*\)[^;\n]*;?/gu;

/** Every module a file names, and the local name each binding is known by. */
export function parseImports(text, extension) {
  const specs = new Set();
  const names = new Map();
  if (extension === '.css' || extension === '.scss') {
    for (const match of text.matchAll(CSS_IMPORT)) specs.add(match[1]);
    return { specs: [...specs], names, globs: [] };
  }
  for (const match of text.matchAll(IMPORT_FROM)) {
    specs.add(match[2]);
    for (const local of localNames(match[1])) names.set(local, match[2]);
  }
  for (const match of text.matchAll(IMPORT_BARE)) specs.add(match[1]);
  for (const match of text.matchAll(IMPORT_CALL)) specs.add(match[1]);
  for (const match of text.matchAll(LAZY_DECLARATION)) names.set(match[1], match[2]);
  const globs = [];
  for (const match of text.matchAll(GLOB_CALL)) {
    for (const pattern of match[1].matchAll(/['"]([^'"]+)['"]/gu)) globs.push(pattern[1]);
  }
  return { specs: [...specs], names, globs };
}

function localNames(clause) {
  const names = [];
  const braces = /\{([^}]*)\}/u.exec(clause);
  for (const part of braces ? braces[1].split(',') : []) {
    const pieces = part.trim().replace(/^type\s+/u, '').split(/\s+as\s+/u);
    const local = (pieces[1] ?? pieces[0]).trim();
    if (local) names.push(local);
  }
  const rest = clause.replace(/\{[^}]*\}/u, '').split(',').map((part) => part.trim()).filter(Boolean);
  for (const part of rest) {
    const namespace = /^\*\s+as\s+([\w$]+)$/u.exec(part);
    if (namespace) names.push(namespace[1]);
    else if (/^[\w$]+$/u.test(part)) names.push(part);
  }
  return names;
}

/** The checkout file a module name points to, or null for a package or a file that is not there. */
export function resolveSpec(fromFile, spec, { fileSet, aliases }) {
  const bare = spec.split('?')[0];
  let base = null;
  if (bare.startsWith('./') || bare.startsWith('../')) base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), bare));
  else {
    const alias = aliases.find((entry) => (entry.wildcard ? bare.startsWith(entry.prefix) : bare === entry.prefix));
    if (alias) base = alias.wildcard ? path.posix.join(alias.target, bare.slice(alias.prefix.length)) : alias.target;
  }
  if (base === null) return null;
  const candidates = [base, ...RESOLVE_EXTENSIONS.map((ext) => `${base}${ext}`), ...RESOLVE_EXTENSIONS.map((ext) => `${base}/index${ext}`)];
  return candidates.find((candidate) => fileSet.has(candidate)) ?? null;
}

function globToRegExp(fromFile, pattern) {
  const absolute = pattern.startsWith('/') ? pattern.slice(1) : path.posix.join(path.posix.dirname(fromFile), pattern);
  const source = path.posix.normalize(absolute).replace(/[.+^${}()|[\]\\]/gu, '\\$&').replace(/\*\*\//gu, '(?:.*/)?').replace(/\*/gu, '[^/]*');
  return new RegExp(`^${source}$`, 'u');
}

/** The value a JSX attribute holds when it is a plain string. */
function attributeValue(tag, name) {
  const match = new RegExp(`[\\s{]${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{\\s*(?:"([^"]*)"|'([^']*)'|\`([^\`$]*)\`)\\s*\\})`, 'u').exec(tag);
  if (!match) return null;
  return match.slice(1).find((value) => value !== undefined) ?? null;
}

function braceBody(text, open) {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    else if (text[index] === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(open + 1, index);
    }
  }
  return text.slice(open + 1);
}

const ELEMENT_ATTRIBUTE = /\selement\s*=\s*\{/u;

/** The tag with its `element={…}` body taken out, so an attribute of the JSX inside is never read as the route's. */
function withoutElement(tag) {
  const element = ELEMENT_ATTRIBUTE.exec(tag);
  if (!element) return tag;
  const open = element.index + element[0].length - 1;
  return tag.slice(0, element.index) + tag.slice(open + braceBody(tag, open).length + 2);
}

function componentsOf(tag) {
  const names = new Set();
  const element = ELEMENT_ATTRIBUTE.exec(tag);
  if (element) {
    const body = braceBody(tag, element.index + element[0].length - 1);
    for (const match of body.matchAll(/<([A-Z][\w$]*)/gu)) names.add(match[1]);
    // A page handed to a wrapper as a prop (`<RouteNode route={TasksRoute} />`); only imported names count.
    for (const match of body.matchAll(/=\s*\{\s*([A-Za-z_$][\w$]*)\s*\}/gu)) names.add(match[1]);
  }
  const component = /\sComponent\s*=\s*\{\s*([A-Za-z_$][\w$]*)/u.exec(tag);
  if (component) names.add(component[1]);
  return [...names];
}

/** Where a `<Route` tag ends: braces and quotes are skipped, so JSX inside `element={…}` is read whole. */
function tagEnd(text, start) {
  let depth = 0;
  let quote = null;
  for (let index = start + 1; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = null;
    } else if (char === '"' || char === "'" || char === '`') quote = char;
    else if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
    else if (char === '>' && depth === 0) return { end: index + 1, selfClosing: text[index - 1] === '/' };
  }
  return null;
}

export function normalizeRoutePath(value) {
  const joined = `/${String(value ?? '')}`.replace(/\/{2,}/gu, '/');
  return joined.length > 1 ? joined.replace(/\/$/u, '') : joined;
}

/** Every `<Route>` a file declares, nested routes with their full path, in source order. */
export function parseRoutes(text) {
  const routes = [];
  const stack = [];
  const pattern = /<Route\b|<\/Route\s*>/gu;
  let match = pattern.exec(text);
  while (match) {
    if (match[0].startsWith('</')) {
      stack.pop();
    } else {
      const tag = tagEnd(text, match.index);
      if (!tag) break;
      const raw = text.slice(match.index, tag.end);
      const parent = stack.length ? stack[stack.length - 1] : null;
      const own = attributeValue(withoutElement(raw), 'path');
      const parentPath = parent === null ? '' : routes[parent].path;
      const full = own === null ? parentPath : own.startsWith('/') ? own : `${parentPath}/${own}`;
      routes.push({
        path: normalizeRoutePath(full),
        index: /\sindex(?=[\s/>]|=\{\s*true\s*\})/u.test(withoutElement(raw)),
        line: lineOf(text, match.index),
        start: match.index,
        end: tag.end,
        components: componentsOf(raw),
        parent,
        raw: squash(raw),
      });
      if (!tag.selfClosing) stack.push(routes.length - 1);
      pattern.lastIndex = tag.end;
    }
    match = pattern.exec(text);
  }
  return routes;
}

/** The checkout read once: files, the import graph both ways, and every route with the files that render it. */
export function buildGraph(root) {
  const fileList = listFiles(root);
  const fileSet = new Set(fileList);
  const appDir = appDirOf(fileSet);
  const aliases = aliasesOf(root, appDir, fileSet);
  const context = { fileSet, aliases };
  const imports = new Map();
  const importers = new Map();
  const routers = new Map();
  const link = (from, to) => {
    if (!to || to === from) return;
    if (!imports.has(from)) imports.set(from, new Set());
    imports.get(from).add(to);
    if (!importers.has(to)) importers.set(to, new Set());
    importers.get(to).add(from);
  };
  for (const file of fileList) {
    const rel = inApp(appDir, file);
    if (rel === null || !rel.startsWith('src/') || !PARSED_EXTENSIONS.has(path.posix.extname(file))) continue;
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    const parsed = parseImports(text, path.posix.extname(file));
    for (const spec of parsed.specs) link(file, resolveSpec(file, spec, context));
    for (const pattern of parsed.globs) {
      const matcher = globToRegExp(file, pattern);
      for (const candidate of fileList) if (matcher.test(candidate)) link(file, candidate);
    }
    if (CODE_EXTENSIONS.includes(path.posix.extname(file)) && /<Route\b/u.test(text)) {
      const names = new Map([...parsed.names].map(([local, spec]) => [local, resolveSpec(file, spec, context)]));
      routers.set(file, { text, routes: parseRoutes(text), names });
    }
  }
  const routes = [];
  for (const [file, router] of routers) {
    const offset = routes.length;
    router.routes.forEach((route, position) => {
      routes.push({
        id: `${file}#${position + 1}`,
        path: route.path,
        index: route.index,
        file,
        line: route.line,
        parent: route.parent === null ? null : `${file}#${route.parent + 1}`,
        entries: [...new Set(route.components.map((name) => router.names.get(name)).filter(Boolean))],
        position: offset + position,
      });
    });
  }
  const entryRoutes = new Map();
  for (const route of routes) for (const entry of route.entries) entryRoutes.set(entry, [...(entryRoutes.get(entry) ?? []), route.id]);
  return { root, appDir, fileSet, aliases, imports, importers, routers, routes, entryRoutes };
}

const chainTo = (previous, file) => {
  const chain = [];
  for (let at = file; at; at = previous.get(at)) chain.unshift(at);
  return chain;
};

/** Walks up the importers of a file: the routes whose page reaches it, or the reason it reaches every page. */
export function reach(graph, start) {
  const previous = new Map([[start, null]]);
  const queue = [start];
  const routes = new Map();
  let everyPage = null;
  while (queue.length) {
    const file = queue.shift();
    const rel = inApp(graph.appDir, file);
    for (const id of graph.entryRoutes.get(file) ?? []) if (!routes.has(id)) routes.set(id, chainTo(previous, file));
    if (rel !== null && SHELL_FILES.test(rel)) {
      everyPage ??= { reason: 'used by the app shell, outside any route', via: chainTo(previous, file) };
      continue;
    }
    for (const importer of graph.importers.get(file) ?? []) {
      if (graph.routers.has(importer)) {
        const declared = (graph.entryRoutes.get(file) ?? []).some((id) => id.startsWith(`${importer}#`));
        if (!declared) everyPage ??= { reason: 'used by the router outside any route', via: [...chainTo(previous, file), importer] };
        continue;
      }
      if (!previous.has(importer)) {
        previous.set(importer, file);
        queue.push(importer);
      }
    }
  }
  return { routes, everyPage };
}

/** Puts a unified diff of one file back the other way: the head's text in, the base's text out. Null when it does not fit. */
export function reverseApply(headText, patch) {
  const lines = headText.split('\n');
  const hunks = [];
  let current = null;
  for (const line of String(patch).split('\n')) {
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/u.exec(line);
    if (header) {
      current = { newStart: Number(header[3]), newCount: header[4] === undefined ? 1 : Number(header[4]), head: [], base: [] };
      hunks.push(current);
    } else if (current && !line.startsWith('\\')) {
      const body = line.slice(1);
      if (line.startsWith('+')) current.head.push(body);
      else if (line.startsWith('-')) current.base.push(body);
      else if (line.startsWith(' ') || line === '') {
        current.head.push(body);
        current.base.push(body);
      }
    }
  }
  for (const hunk of hunks) {
    // A trailing empty line in the hunk is the patch's own final newline, not a context line.
    while (hunk.head.length > hunk.newCount && hunk.head.at(-1) === '' && hunk.base.at(-1) === '') {
      hunk.head.pop();
      hunk.base.pop();
    }
  }
  for (const hunk of hunks.reverse()) {
    const at = hunk.newCount === 0 ? hunk.newStart : hunk.newStart - 1;
    const slice = lines.slice(at, at + hunk.head.length);
    if (slice.length !== hunk.head.length || slice.some((line, index) => line !== hunk.head[index])) return null;
    lines.splice(at, hunk.head.length, ...hunk.base);
  }
  return lines.join('\n');
}

function routerShape(graph, file, text) {
  const routes = parseRoutes(text);
  const parsed = parseImports(text, path.posix.extname(file));
  const names = new Map([...parsed.names].map(([local, spec]) => [local, resolveSpec(file, spec, graph) ?? spec]));
  let rest = text;
  for (const route of [...routes].reverse()) rest = rest.slice(0, route.start) + rest.slice(route.end);
  rest = rest.replace(IMPORT_FROM, '').replace(IMPORT_BARE, '').replace(LAZY_DECLARATION, '').replace(/<\/Route\s*>/gu, '');
  const keyed = new Map();
  routes.forEach((route, position) => keyed.set(`${route.path}|${route.index ? 'index' : ''}`, { route, position, sources: route.components.map((name) => names.get(name) ?? name).join(',') }));
  return { keyed, rest: squash(rest) };
}

/** A changed router file: the routes whose declaration changed, the paths it removed, or every page. */
export function routerChange(graph, file, patch) {
  if (!patch) return { everyPage: { reason: 'the router file changed and the change came without its diff' } };
  const headText = graph.routers.get(file)?.text ?? fs.readFileSync(path.join(graph.root, file), 'utf8');
  const baseText = reverseApply(headText, patch);
  if (baseText === null) return { everyPage: { reason: 'the router file in the checkout is not the one the diff was made on' } };
  const head = routerShape(graph, file, headText);
  const base = routerShape(graph, file, baseText);
  if (head.rest !== base.rest) return { everyPage: { reason: 'the router file changed outside its routes' } };
  const routes = [];
  for (const [key, now] of head.keyed) {
    const before = base.keyed.get(key);
    if (!before || before.route.raw !== now.route.raw || before.sources !== now.sources) routes.push(`${file}#${now.position + 1}`);
  }
  const removedPaths = [...base.keyed.keys()].filter((key) => !head.keyed.has(key)).map((key) => key.split('|')[0]);
  return { routes, removedPaths };
}

/** What one changed file can change in the running app: nothing, some routes, or every page. */
export function effectOf(graph, change) {
  const file = change.path;
  const rel = inApp(graph.appDir, file);
  const result = (effect, reason, extra = {}) => ({ path: file, status: change.status, effect, reason, ...extra });
  if (rel === null) {
    return GLOBAL_REPO_FILES.some((pattern) => pattern.test(file))
      ? result('every page', 'hosting configuration')
      : result('none', 'outside the app folder');
  }
  if (NO_UI_FILES.some((pattern) => pattern.test(rel)) && !graph.importers.has(file)) return result('none', 'not part of what the browser loads');
  if (GLOBAL_FILES.some((pattern) => pattern.test(rel))) return result('every page', 'part of every page’s build');
  if (change.status === 'removed') return result('none', 'deleted; the files that imported it changed too');
  if (!graph.fileSet.has(file)) {
    return change.status === 'added'
      ? result('none', 'new file the checkout does not have yet; the files that import it changed too')
      : result('every page', 'not in the checkout analysed, so where it is used is unknown');
  }
  if (graph.routers.has(file)) {
    const routed = routerChange(graph, file, change.patch);
    if (routed.everyPage) return result('every page', routed.everyPage.reason);
    return result('routes', 'route declarations changed', { routes: routed.routes, removedPaths: routed.removedPaths, via: [file] });
  }
  const reached = reach(graph, file);
  if (reached.everyPage) return result('every page', reached.everyPage.reason, { via: reached.everyPage.via });
  if (reached.routes.size) {
    const [firstId] = reached.routes.keys();
    return result('routes', 'imported by the pages of these routes', { routes: [...reached.routes.keys()], via: reached.routes.get(firstId) });
  }
  if (DATA_EXTENSIONS.has(path.posix.extname(file))) return result('every page', 'a data file no import names, which the app may read another way');
  return result('none', 'not imported by any page');
}

/** A route and every route nested inside it: a layout's change shows on each of its children. */
export function withDescendants(graph, ids) {
  const out = new Set(ids);
  let grew = true;
  while (grew) {
    grew = false;
    for (const route of graph.routes) {
      if (route.parent && out.has(route.parent) && !out.has(route.id)) {
        out.add(route.id);
        grew = true;
      }
    }
  }
  return out;
}

// React Router's own ranking: a static segment outranks a parameter, a splat ranks last.
const SEGMENT_SCORE = { static: 10, dynamic: 3, optional: 2, splat: -2, empty: 1 };

function routeMatcher(routePath) {
  const segments = routePath.split('/').filter(Boolean);
  let score = segments.length;
  let source = '';
  for (const segment of segments) {
    if (segment === '*') {
      score += SEGMENT_SCORE.splat;
      source += '(?:/.*)?';
    } else if (segment.startsWith(':')) {
      const optional = segment.endsWith('?');
      score += optional ? SEGMENT_SCORE.optional : SEGMENT_SCORE.dynamic;
      source += optional ? '(?:/[^/]+)?' : '/[^/]+';
    } else {
      score += SEGMENT_SCORE.static;
      source += `/${segment.replace(/[.+^${}()|[\]\\*?]/gu, '\\$&')}`;
    }
  }
  if (!segments.length) score += SEGMENT_SCORE.empty;
  return { regex: new RegExp(`^${source || ''}/?$`, 'u'), score };
}

/** The route that renders a path, as React Router picks it: the best-ranked match, the deepest on a tie. */
export function routeForPath(graph, pagePath) {
  let best = null;
  for (const route of graph.routes) {
    const matcher = routeMatcher(route.path);
    if (!matcher.regex.test(pagePath)) continue;
    const depth = depthOf(graph, route);
    if (!best || matcher.score > best.score || (matcher.score === best.score && depth > best.depth)) best = { route, score: matcher.score, depth };
  }
  return best?.route ?? null;
}

function depthOf(graph, route) {
  let depth = 0;
  for (let at = route; at?.parent; at = graph.routes.find((other) => other.id === at.parent)) depth += 1;
  return depth;
}

export function pathMatches(routePath, pagePath) {
  return routeMatcher(routePath).regex.test(pagePath);
}
