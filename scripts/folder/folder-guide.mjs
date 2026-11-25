/** The folder table the solution guide shows: what each root entry holds and when to look. */
import { SOLUTION_CHART_FILE, SOLUTION_MAP_FILE, WIRING_FILE, SOLUTION_MAP_FOLDER } from './folder-layout.mjs';

// Every root entry folder-layout.mjs writes needs a row.
// A row with `internal: true` is not rendered: Claude reads it only through the CLI, named in one line.
// A function, not a const: folder-layout imports render.mjs, which reaches this file, so the
// path constants are not ready while this module loads.
export function folderGuide() {
  return [
    { path: 'records/', internal: true, readWith: ['solution context', 'spec get', 'plan get'] },
    { path: 'specs/', holds: 'Each spec as Markdown and HTML.', lookWhen: 'You need what a change agreed to.' },
    { path: 'plans/', holds: 'Each plan as Markdown, with its tasks.', lookWhen: 'You need a plan\'s tasks and their status.' },
    { path: 'docs/', holds: 'Feature docs for apps, automations and features.', lookWhen: 'You need how a built feature works.' },
    { path: 'docs/prd/', holds: 'Each app\'s PRD as approved: what the app is for, its requirements, its plan and its tickets. Written by `/ua:native-scope-loop`, kept current by `/ua:native-build-loop` after a build, or changed with the `prd` commands; every version stays on the tenant.', lookWhen: 'Before you change an app that has one, and when a request may go beyond it.' },
    { path: 'entities/', internal: true, readWith: ['cache', 'entity context'] },
    { path: 'entity-manifests/', internal: true, readWith: ['cache'] },
    { path: 'memory.md', holds: 'The solution memory the whole team shares: decisions, corrections and facts saved by anyone on this solution.', lookWhen: 'Before a change, to respect past decisions.' },
    { path: 'tests/', holds: 'UI test runs, one folder per app.', lookWhen: 'You work on UI tests.' },
    { path: 'reviews/', holds: 'Config reviews from `/ua:app-config-review`, one folder per app and one per run, each with `report.md`.', lookWhen: 'You need an app\'s last review or its open findings.' },
    { path: '<appId>/<branch>/', holds: 'A code app\'s local checkout: its committed source, a git repository with no remote, which the code app agent edits and pushes to Code Builder\'s engine. In its `app/` folder, `bun install --ignore-scripts`, then `./node_modules/.bin/tsc -b` and `./node_modules/.bin/vite build` check the build, and `./node_modules/.bin/vite` runs the dev server.', lookWhen: 'You need a code app\'s source, or want to build or run it locally.' },
    { path: '.sessions/<id>/', holds: 'This session\'s state. Write every draft in `.sessions/<id>/drafts/`.', lookWhen: 'You write a spec, a tasks file or any other draft.' },
    { path: SOLUTION_MAP_FILE, holds: 'Every linked entity and what it is wired to, in words.', lookWhen: 'You look up a name or the current wiring.' },
    { path: SOLUTION_CHART_FILE, holds: 'The same wiring as a Mermaid chart, with the tenant and every id.', lookWhen: 'You check if an id is in this solution.' },
    { path: WIRING_FILE, internal: true, readWith: ['impact'] },
    { path: `${SOLUTION_MAP_FOLDER}/sync.json`, holds: 'Whether a cache sync is running, and when it ended.', lookWhen: 'Before you trust the cache.' },
    { path: 'AGENTS.md', internal: true, readWith: [] },
  ];
}

export function renderFolderMap() {
  const rows = folderGuide().filter(row => !row.internal).map(row => `| \`${row.path}\` | ${row.holds} | ${row.lookWhen} |`);
  const internal = folderGuide().filter(row => row.internal && row.readWith.length);
  const commands = [...new Set(internal.flatMap(row => row.readWith))].map(name => `\`${name}\``);
  return [
    '| Path | Holds | Look when |',
    '|---|---|---|',
    ...rows,
    '',
    `Never open ${internal.map(row => `\`${row.path}\``).join(', ')} directly. Read them through ${commands.join(', ')}.`,
  ].join('\n');
}
