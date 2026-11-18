// The CLI's command surface and its per-command help. The command table, the
// flag table and the help text live together so a flag cannot be added without
// a description, and the JSON payload a flag points at is documented where the
// flag is declared. `ua <area> <command> --help` renders one entry;
// `--help --json` returns the same entry as a machine-readable schema.

import { FAMILY_NAMES, MISC_FAMILY } from './contracts.mjs';

export const COMMANDS = Object.freeze({
  state: ['next', 'resolve'],
  solution: ['resolve', 'handoff', 'handoff-claim', 'find', 'locate', 'storage-check', 'connect', 'open', 'create', 'refresh', 'mcp-setup', 'context'],
  task: ['begin', 'update', 'get', 'end', 'note'],
  spec: ['check', 'render', 'draft', 'accept', 'revise', 'get', 'list'],
  fast: ['brief', 'accept'],
  entity: ['read', 'context', 'list', 'link'],
  cache: ['app', 'nav', 'paths', 'page', 'outline', 'blocks', 'grep', 'ds', 'deps', 'events', 'form', 'keys', 'obj', 'wf', 'agent', 'diff', 'limits'],
  impact: ['automation', 'object', 'page', 'app', 'ai-agent'],
  plan: ['propose', 'create', 'revise', 'audit', 'fork', 'interrupt', 'start', 'resume', 'mark-failed', 'ready', 'task', 'report', 'confirm', 'reclaim', 'finish', 'get', 'list'],
  memory: ['remember', 'get', 'consolidate'],
  feature: ['upsert', 'list', 'get', 'match'],
  prd: ['list', 'get', 'history', 'diff', 'check', 'classify', 'save', 'approve', 'tickets', 'restore', 'discard', 'verify'],
  session: ['save'],
  changeset: ['confirm'],
  skill: ['sessions', 'publish'],
});

export const FLAGS = {
  'state next': ['tenant', 'after-login', 'solution'],
  'state resolve': ['request'],
  'solution resolve': ['tenant'], 'solution handoff': ['tenant', 'id', 'name', 'entity', 'request', 'folder'], 'solution handoff-claim': ['release'], 'solution find': ['tenant', 'entity'], 'solution locate': ['link'], 'solution storage-check': ['tenant'], 'solution connect': ['tenant'],
  'solution open': ['tenant', 'id', 'request', 'override-folder', 'storage', 'created'], 'solution create': ['tenant', 'name', 'request', 'override-folder', 'storage', 'prepare'],
  'solution refresh': [], 'solution mcp-setup': ['tenant', 'url'], 'solution context': [],
  'task begin': ['request', 'outcome', 'targets', 'references'], 'task update': ['outcome', 'phase', 'plan', 'approval', 'sent', 'agent', 'done', 'entity', 'read-back', 'waiting'],
  'task get': [], 'task end': ['status'], 'task note': ['decision', 'question'],
  'spec check': ['md-file'], 'spec render': ['md-file', 'out'], 'spec draft': ['title', 'md-file', 'html'], 'spec accept': ['draft', 'ask-before-deploy', 'no-ask-before-deploy', 'derived-from'],
  'spec revise': ['md-file', 'html', 'note'], 'spec get': [], 'spec list': [],
  'fast brief': ['title', 'md-file'], 'fast accept': ['draft', 'ask-before-deploy', 'no-ask-before-deploy', 'derived-from', 'execution'],
  'entity read': ['name', 'app-id', 'source'],
  'entity context': ['app-id', 'name', 'save'],
  'cache app': ['app-id', 'refresh'], 'cache nav': ['app-id', 'refresh'], 'cache paths': ['app-id', 'refresh'], 'cache page': ['app-id', 'refresh'], 'cache outline': ['app-id', 'root', 'depth', 'refresh'],
  'cache blocks': ['app-id', 'name', 'id', 'ids', 'match', 'field', 'limit', 'refresh'],
  'cache grep': ['app-id', 'field', 'limit', 'refresh'], 'cache ds': ['app-id', 'name', 'id', 'refresh'], 'cache deps': ['app-id', 'refresh'],
  'cache events': ['app-id', 'name', 'refresh'], 'cache form': ['app-id', 'block', 'refresh'], 'cache keys': ['app-id', 'name', 'refresh'],
  'cache obj': ['refresh'], 'cache wf': ['contract', 'deps', 'refresh'], 'cache agent': ['refresh'],
  'cache diff': ['app-id', 'versions'], 'cache limits': [],
  'impact automation': ['change'], 'impact object': ['change'], 'impact page': ['app-id', 'change'], 'impact app': ['change'], 'impact ai-agent': ['change'],
  'entity list': [],
  'entity link': ['app-id', 'object-id', 'group-id', 'client-id', 'refs'],
  'plan propose': ['file', 'tasks-file', 'save', 'go', 'preview', 'hash', 'request', 'task', 'mode', 'derived-from', 'evidence-file'],
  'plan create': ['spec', 'tasks-file', 'evidence-file', 'derived-from'],
  'plan revise': ['tasks-file', 'evidence-file', 'reason', 'impact', 'ready-when', 'release-yes'],
  'plan audit': ['file', 'tasks-file'],
  'plan fork': ['tasks-file', 'evidence-file', 'reason'],
  'plan interrupt': ['reason'], 'plan start': [],
  'plan resume': [],
  'plan mark-failed': ['reason'], 'plan ready': ['mark', 'agent-ids', 'no-resume', 'spread'],
  'plan task': ['status', 'result-file', 'error', 'agent-name', 'answer'],
  'plan report': ['agent-name', 'report-file', 'usage-limit'],
  'plan confirm': [], 'plan reclaim': ['agent-name'],
  'plan finish': ['user-requested', 'failed', 'reason'], 'plan get': [], 'plan list': ['status'],
  'memory remember': ['plan'], 'memory get': [], 'memory consolidate': ['file'],
  'feature upsert': ['file'], 'feature list': [], 'feature get': [], 'feature match': ['entities'],
  'prd list': [], 'prd get': ['version', 'part'], 'prd history': [], 'prd diff': ['part'], 'prd check': ['file'], 'prd classify': ['file', 'base'],
  'prd save': ['file', 'base', 'note', 'record-version'], 'prd approve': ['version', 'record-version', 'app-id', 'minor'],
  'prd tickets': ['version', 'file', 'app-id', 'add'], 'prd restore': ['version', 'note'], 'prd discard': ['version', 'record-version'], 'prd verify': [],
  'session save': ['type', 'family', 'suggested-family', 'plan-id', 'remarks', 'remarks-file', 'remarks-only'],
  'changeset confirm': ['name', 'id', 'answer', 'password-choice'],
  'skill sessions': [], 'skill publish': ['folder', 'skill-id', 'replace'],
};

export const BOOLEAN = new Set(['json', 'help', 'refresh', 'save', 'contract', 'deps', 'after-login', 'ask-before-deploy', 'no-ask-before-deploy', 'user-requested', 'failed', 'override-folder', 'remarks-only', 'minor', 'add', 'mark', 'no-resume', 'spread', 'usage-limit', 'release', 'prepare', 'created', 'go', 'preview', 'html', 'replace']);

export const GLOBAL_FLAGS = Object.freeze({
  json: 'Print the result as JSON on stdout; the one-line message goes to stderr.',
  session: 'Claude session ID. Claude supplies CLAUDE_CODE_SESSION_ID; outside Claude use one stable id for the whole CLI session.',
  help: 'Print this help, with the JSON payload schema when the command reads a file.',
});

const ENTITY_REF = {
  kind: 'string, required — object, record, automation, app, page, code-app, graph or entity. A code-app is a Code Builder app; app and page are the no-code builder\'s.',
  name: 'string, required — the entity name as the platform shows it.',
  id: 'string, optional — the one platform id once it exists. Several ids joined by commas are refused: give each entity its own task.',
  appId: 'string, optional — the owning app id for a page. For a NEW app (`app · <name> · new` in Touches) plan create refuses a page without it: the id this plan fixes for the app, lowercase letters, digits and single hyphens, the same in every task of that app (the app task and a publish of the app give it as id).',
  app: 'string, optional — the owning app name for a page. A page-layout of an app with an app task in the plan waits on that task, which creates a new app or stores an existing app\'s look.',
  module: 'boolean, optional — on the app task only: the new app is a global module. The platform makes a module\'s id when the app task creates it, so no task of that app names an id (entity.id, entity.appId): the app task reports it in ids.entity, and its pages and publish read it in Built so far.',
};

const TASK_FIELDS = {
  id: 'string, required — "t1", "t2", … one per task, unique in the plan. q<n> ids ("q1", "q2", …) are the quality fix tasks plan audit writes; never use one for other work. Any other form, such as "s1", is refused.',
  title: 'string, required — the one-line name the dispatch and reports use.',
  kind: 'string, required — object, record, automation, automation-shell, deploy, app, page-layout, page-review, page-bind, publish, ai-agent, dataset, metric, experiment, api, env-variable, connector, code-app, code-publish, graph or manual. An app task (entity { kind: "app", name, id }) creates a new app with the id the plan fixes and stores its look, or stores a look change on an existing app; every page-layout of that app waits on it. A page with a job line gets a page-review that depends on its page-bind (the page bound to its data, right after its layout), or on its page-layout when the plan does not bind the page; a bind of another page that links to it and the publish of its app wait on that review, and the page\'s own bind never does. The kind picks the agent; a publish of an ai-agent entity goes to agent-builder, and so do dataset, metric and experiment. An automation-shell needs deploy <its automation> in ## Ready when. A code-app or code-publish task works on a Code Builder app, entity kind code-app; a code-publish needs publish <its app> in ## Ready when.',
  entity: 'EntityRef, required — { kind, name, id?, appId?, app? }. Needs a non-empty name. A page names its app in app and its app id in appId; a new app\'s pages and its publish carry the one app id this plan fixes for it.',
  dependsOn: 'string[], required — task ids whose id or output this task uses. May be empty and must not contain its own id. A page-bind on a new page needs at least one, its page-layout; a page-bind on an existing page (an entity id, or a page Touches line with an id) may have none; a page-layout may not depend on object, record, automation, automation-shell, deploy, ai-agent, dataset, metric, experiment, api, env-variable or connector tasks. An automation task on the same automation as an automation-shell must depend on that shell. Each new app a task names has one app task, and every page-layout of an app with an app task depends on it; layouts of one app need not wait on one another. A task that depends on the page-layout of a page with a job, except that page\'s own page-bind, also depends on that page\'s page-review. A code-publish depends on every code-app task of its app.',
  body: 'string, required — at least five lines of concrete instruction, one string with a newline between lines (a list of lines is joined). Placeholders (TBD, TBC or TODO in capitals, to be decided, handle errors, similar to, wire it up, fill in) are rejected in the body and the proof, by name; a literal in a code span or quotes, such as the picklist code `todo`, is not. An object or record task never states a count of fields, columns or indexes: it says every field the body lists.',
  proof: 'string, required — the read-back that proves this task landed; a list of lines is joined, as for body.',
  visual: 'boolean, optional — true when the Proof row marks [visual]. Set automatically from the spec when the entity is listed there.',
  deletes: 'string, optional — what the task deletes, in plain words ("the 3 TEST rows of Request", "page Old Home"). plan ready asks the person before it sends the task, in both modes, and plan confirm saves the yes. A body that names a delete tool needs it, unless the task is manual. Rows the same task created need none. Leave the key out, or set it to null, when the task deletes nothing.',
  audit: 'boolean, optional — true on a q<n> quality fix task that plan audit added, and only there: a q<n> task without it, or a t<n> task with it, is refused. In plan revise, keep it on every q<n> task the file lists.',
  graphNodes: 'string[], graph tasks only — the node names this task builds, each one in the spec\'s ### Context graph part; plan create refuses any other name. Empty when the stage builds no node.',
  graphEdges: 'string[], graph tasks only — the edge names this task builds, from the same part. Empty when the stage builds no edge.',
};

const QUALITY_TASK_FIELDS = {
  id: 'string, required — "q1", "q2", … one per audited page with something to fix, never an id the plan already uses.',
  title: 'string, required — the one-line name, e.g. "Page quality fixes on Home".',
  kind: 'string, required — page-bind, always.',
  entity: 'EntityRef, required — { kind: "page", id, name, app?, appId }: a page the audit covers, that is a page of a done page-layout or page-bind task of a MOBILE app, under the page id plan ready named.',
  dependsOn: 'string[], required — leave it empty. plan audit fills it with every task already on the same page (its layout, its bind, its page review, and an earlier fix task of the same page in this file), so a fix runs after the review and never beside another bind of its page. Name another task only when the fix must also wait on it.',
  audit: 'boolean, required — true. It marks the task as a quality fix.',
  body: 'string, required — at least five lines: what to read first, then one line per finding (rule · block id and name · what to write), then the read-back line.',
  proof: 'string, required — 0 blocking findings on the listed rules from a re-run of page-audit.mjs, and the read-back.',
  visual: 'boolean, optional — true only when the person asked for screenshots of the page.',
};

const QUALITY_TASK_EXAMPLE = [{
  id: 'q1',
  title: 'Page quality fixes on Home',
  kind: 'page-bind',
  entity: { kind: 'page', id: 'e_home', name: 'Home', app: 'Member App', appId: 'member-app' },
  dependsOn: [],
  audit: true,
  body: '1. Read first: the cache outline of Home and live get_blocks for b_tile and b_renew.\n2. P4 tileIcon (b_tile): set content.data.src to the 192×192 WebP address.\n3. X2 renewButton (b_renew): set appearance.loading to the source\'s isLoading.\n4. Leave every other block as it is.\n5. Read back and report each proof line.',
  proof: 'page-audit.mjs on Home reports 0 blocking findings for P4 and X2; get_blocks shows the new src on b_tile and the loading binding on b_renew.',
}];

const TASK_EXAMPLE = [{
  id: 't1',
  title: 'Create the Task object',
  kind: 'object',
  entity: { kind: 'object', name: 'Task' },
  dependsOn: [],
  body: 'Read the live object list for Task first with get_objects.\nCreate object Task with id OBJ_task in one apply_object_batch create_object step.\nAdd field name: {"type": "string"}, required.\nAdd field description: {"type": "string"}, optional.',
  proof: 'get_objects shows Task with the name and description fields.',
}];

const RESULT_FIELDS = {
  ids: 'object, required — platform ids this task produced, e.g. { "entity": "e_123", "app": "e_456" }. May be empty.',
  readBack: 'string[], required — quoted lines read back from the platform after the write. An ok report needs at least one.',
  unverified: 'string[], required — anything the task could not prove. May be empty.',
  notes: 'string[], required — anything the next task should know. May be empty.',
};

const REPORT_FIELDS = {
  tasks: 'object[], required — one entry per task in the batch: { id, status, change?, ids, readBack, unverified, notes, error? }. status is ok, failed, not_started, auth_expired, needs_confirmation, declined or waiting. A waiting entry also has checkAfter, the minutes to wait (1 to 120). An ok entry needs a read-back line that names its entity or quotes one of its ids.',
};

const BINDING_NOTE = 'TENANT_BINDING_CONFLICT: another session connected this folder to another tenant (solution connect) and used it in the last 24 hours. The same session, the same tenant or an older binding proceeds, and the binding is removed.';
const SPEC_MD_NOTE = 'Markdown with YAML frontmatter, a # title, and ## Requested outcome, ## Touches and ## Ready when (the only required headings). The other headings of skills/plan/references/spec-template.md are optional.';

/** One entry per `<area> <command>`. `flags` must name exactly the flags in FLAGS. */
const PRD_MD_NOTE = 'Markdown with three parts under # PRD, # App plan and # Tickets (a file with no part heading is read as the PRD part). The PRD part answers ## Outcome, ## Users and roles, ## Scope, ## Journeys (J<n> lines), ## Requirements (### R<n> · must|should|could · <what>, each with - A<n>.<m>: acceptance lines and a - Screens: line), ## Screens (### S<n> · <name>), ## Data, ## Rules, ## Integrations, ## Failures, ## Quality and ## Rollout; ## Current state and ## Open questions (Q<n> · <question> · owner: <who>) are optional. An optional section may say N/A — <why>; Screens may not.';
const APP_ARG = { name: '<app>', description: 'The app the PRD is for, as a slug such as leave-management.' };

const HELP = {
  'state next': {
    summary: 'Report the next startup step for this session: continue_solution, handoff, ask_tenant, login, pick_solution or ready. Also returns app: desktop in the Claude desktop app, else terminal.',
    flags: {
      tenant: 'Tenant host, e.g. your-tenant.unifyapps.com. Without it the next step is ask_tenant.',
      'after-login': 'Boolean. Set once the tenant login has succeeded.',
      solution: 'Solution key or id already registered for this tenant.',
    },
  },
  'state resolve': {
    summary: 'List every entity link and bare entity id in what the person typed, with its host, kind, id and whether it is well formed. Saves nothing. Needs no session and no tenant, and makes no network call.',
    flags: { request: 'The person\'s text, word for word.' },
    required: ['--request'],
  },
  'solution resolve': {
    summary: 'Classify what the person typed as a solution URL, id or name. A URL or id touches nothing; a name is searched on the tenant through the `solution` MCP server and returns `matches`, exact names first.',
    args: [{ name: '<url|id|name>', description: 'A solution URL, an e_ id, or a name to search for.' }],
    flags: { tenant: 'Tenant host. A URL for a different host is rejected.' },
    required: ['--tenant', '<url|id|name>'],
  },
  'solution handoff': {
    summary: 'Hand a chosen solution over to a new folder: makes the folder and writes a handoff file for it under the UnifyApps Headless home (`handoffs/`), so `/ua:setup` in that folder opens it without asking for the tenant or the solution again. Talks to no tenant.',
    flags: {
      tenant: 'Tenant host.',
      id: 'The id of the solution to open there. Give exactly one of --id and --name.',
      name: 'The name of a new solution to create there.',
      entity: 'Optional. A builder link or id to link after the solution opens.',
      request: 'Optional. The opening request, carried to the new session.',
      folder: 'An absolute path or one starting with ~/. Created when missing. Refused when it already holds a solution.',
    },
    required: ['--tenant', '--folder'],
    notes: [
      'Returns the folder.',
      'The file is mode 0600, is ignored after 24 hours, and is removed by solution open or create in that folder when it is still the handoff that session claimed or read.',
      'The request is kept word for word, up to 4,000 characters; a longer one is cut and the handoff says requestTruncated: true.',
    ],
  },
  'solution handoff-claim': {
    summary: 'Claim this folder\'s handoff for this session, so a second session started in the same folder does not open it too. Returns state: valid (claimed by this session), claimed (another session holds it), missing, expired or invalid. Talks to no tenant.',
    flags: { release: 'Boolean. Give back this session\'s claim, after the open or create it was for failed.' },
    notes: ['solution open or create in this folder removes the claimed handoff and its claim.'],
  },
  'task begin': {
    summary: 'Start the current task of this session and keep it in the session state, so a compaction or resume knows what is being done. A task already open is ended as stopped first. History keeps the last 20 tasks.',
    flags: {
      request: 'What the person asked, word for word.',
      outcome: 'Optional. The result the person wants, in one line.',
      targets: 'Optional. JSON array of the entities the task changes.',
      references: 'Optional. JSON array of entities or links the task only reads.',
    },
    required: ['--request'],
  },
  'task update': {
    summary: 'Change the current task. --approval, --sent and --done each add one entry; the other flags replace their field. A piece stays in sent until its done is recorded, so a resume knows what may be half written.',
    flags: {
      outcome: 'The result the person wants.',
      phase: 'The phase the task is in, in a few words.',
      plan: 'The plan id that carries the task.',
      approval: 'One approval the person gave, in their words or a short line. Added to approvals.',
      sent: 'One piece handed to a builder agent, in a short line. Needs --entity. Added to sent.',
      agent: 'With --sent: the builder agent\'s name. Makes its work folder, .sessions/<sessionId>/work/<agent>/, and returns it as workFolder.',
      done: 'One piece that is done, in a short line. Needs --entity and --read-back. Added to done, and taken out of sent.',
      entity: 'With --sent or --done: the name or id of the entity the piece changes.',
      'read-back': 'With --done: the line of a read made after the write that shows it. Refused unless it names --entity.',
      waiting: 'JSON value naming what the task waits for, or null.',
    },
  },
  'task get': { summary: 'Return the current task and the short history.', flags: {} },
  'task end': {
    summary: 'End the current task and move it to the history.',
    flags: { status: 'done (default) or stopped.' },
  },
  'task note': {
    summary: 'Add to the session ledger (state.ledger): decisions and corrections the person made, and open questions waiting on them. Entities fill from task update --done, not from here. Capped at about 2 KB; the oldest decision, then the oldest open question, then the oldest entity, drops first. Needs no current task. A SessionStart after compaction re-injects the whole ledger.',
    flags: {
      decision: 'One decision or correction the person made, in their words ("use the Orders object, not Sales"). Added to decisions.',
      question: 'One question still waiting on the person, or an assumption made in its place. Added to openQuestions.',
    },
  },
  'solution find': {
    summary: 'Before a solution is open: find the solutions on the tenant that hold one app, page, object or automation, and suggest the ones that hold what is linked to it one step away, in either direction. It asks the tenant\'s `solution` MCP server.',
    flags: {
      tenant: 'Tenant host.',
      entity: 'A builder link, an object id, an automation id, an app id, or an app name. A word with no spaces is tried as an app id, then as an object id; anything else is searched among app names only.',
    },
    required: ['--tenant', '--entity'],
    notes: [
      'direct: solutions that already hold the entity. suggested: solutions that hold an app, object or automation linked to it, each with via rows { kind, id, name, link } where link is usesIt (the linked entity uses it) or itUses (it uses the linked entity). Nothing is matched by name.',
      'folders: the folders on this machine that already hold each solution, newest first.',
      'A name that matches several apps returns candidates and nothing else. notFound with no entity means nothing on the tenant has that id or app name.',
      'notFound with an entity means the tenant proved that id missing, so nothing was searched. A read that failed for another reason is a warning, not notFound.',
      'Changes nothing on the tenant and nothing in this folder.',
    ],
  },
  'solution locate': {
    summary: 'For each entity link or id in the text, say where it lives compared with the solution open in this folder. It asks the same solution search as solution find.',
    flags: { link: 'Text holding one or more builder links or entity ids.' },
    required: ['--link'],
    notes: [
      'connected: an entity of this solution uses it or is used by it. suggested (unlinked only): one other solution that holds something linked to it.',
      'status per link: in-this-solution, in-other-solution (with solutions and their folders), unlinked-same-tenant, other-tenant, not-found, lookup-failed (with error), no-solution-here, invalid-link.',
      'A failed or partial search, or a tenant that keeps solutions in folders, is lookup-failed, never unlinked.',
      'Changes nothing on the tenant and nothing in this folder.',
    ],
  },
  'solution storage-check': {
    summary: 'Probe the tenant for the six solution record types and record whether this tenant stores solutions on the platform or in this folder. Runs right after a sign-in, so it also registers this Claude session with the tenant, which lists the tenant tools before any solution is open.',
    flags: { tenant: 'Tenant host to probe.' },
    required: ['--tenant'],
    notes: ['A missing record type makes the tenant local: the whole solution lifecycle then lives in records/local-store.json.',
      'signInRegistered: true when the session was registered with the tenant (a sign-in entry, with no solution, that solution open or create replaces). A production tenant is refused instead.'],
  },
  'solution connect': {
    summary: 'Connect this folder to a tenant before any solution exists, so questions about the tenant can be answered with read-only tenant tools. Creates no solution.',
    flags: { tenant: 'Tenant host to connect to. Refused on a production tenant.' },
    required: ['--tenant'],
    notes: [
      'Needs a Claude session id, like solution open. A session on the same tenant joins the folder\'s binding.',
      'TENANT_BINDING_CONFLICT: the folder is connected to another tenant that was used in the last 24 hours, or it holds a solution on another tenant. An older binding is replaced.',
      'While no solution is open here, the tenant bridges pass on read tools only, and every other command except solution mcp-setup and the task area answers NO_SOLUTION.',
      'solution open or create in this folder replaces the binding with the solution.',
    ],
  },
  'solution open': {
    summary: 'Open an existing solution into this folder and start the session.',
    flags: {
      tenant: 'Tenant host that holds the solution.',
      id: 'Solution id. An id starting with e_local names local storage on its own.',
      request: 'What the person typed after /ua:setup, kept word for word on the session as openingRequest, up to 4,000 characters; a longer one is cut and openingRequestTruncated is true.',
      'override-folder': 'Boolean. Use this folder even though it already holds a different solution.',
      storage: 'platform or local. Defaults to the tenant storage check, or platform.',
      created: 'Boolean. The record was created a moment ago by setup through the create_solution tool: the table says Created, a handoff file that named the solution by name now names its id, and the `UnifyApps Headless` tag is added when the tool did not set it (tagged: true).',
    },
    required: ['--tenant', '--id'],
    notes: ['Needs a Claude session id: CLAUDE_CODE_SESSION_ID or --session.',
      'The record with its specs, plans, documents and linked-asset rows is read through the tenant\'s get_solution tool, called by the CLI; a tenant without the tool is read through the entity API.', BINDING_NOTE],
  },
  'solution create': {
    summary: 'Create a solution on the tenant and open it into this folder.',
    flags: {
      tenant: 'Tenant host to create the solution on.',
      name: 'Solution name.',
      request: 'What the person typed after /ua:setup, kept word for word on the session as openingRequest, up to 4,000 characters; a longer one is cut and openingRequestTruncated is true.',
      'override-folder': 'Boolean. Use this folder even though it already holds a different solution.',
      storage: 'platform or local. Defaults to the tenant storage check, or platform.',
      prepare: 'Boolean. Run the folder and name checks and post nothing. Answers via: tool (call create_solution with the returned tool.arguments, then solution open --created) or cli (local storage: run this command again without --prepare).',
    },
    required: ['--tenant', '--name'],
    notes: ['A 5xx from the platform marks the error localFallback: true; rerun with --storage local to continue in this folder.',
      'Setup creates through the create_solution tool: --prepare first, the tool call, then solution open --created. This command without --prepare is the path for local storage and for a tenant that does not serve the tool.', BINDING_NOTE],
  },
  'solution refresh': { summary: 'Pull the solution, its specs, plans and documents from the platform into this folder, through the tenant\'s get_solution tool when it serves it.', flags: {} },
  'solution mcp-setup': {
    summary: 'Verify the tenant MCP bridges and store the verified URL on this session.',
    flags: { tenant: 'Tenant host. Must match the open session, or the tenant this folder is connected to.', url: 'Replacement HTTPS base to verify instead of https://<tenant>/llm-tools.' },
    required: ['--tenant'],
  },
  'solution context': { summary: 'Report the open solution: app (desktop in the Claude desktop app, else terminal), the tenant and the environment it answered at the production check on open, mode, storage, the opening request, memory, features, one short line per plan (id, title, status, mode, spec, date, source plan), the resumable plan with its task counts, and other sessions. plan get reads one plan in full.', flags: {} },
  'spec check': {
    summary: 'Check a spec Markdown file without writing anything. It needs a title, ## Requested outcome, ## Touches and ## Ready when; a requirements checklist, when present, only adds warnings.',
    flags: { 'md-file': 'Path to the spec Markdown.' },
    required: ['--md-file'],
    input: { flag: 'md-file', format: 'markdown', description: SPEC_MD_NOTE },
    exitCodes: { 0: 'The spec can be accepted (warnings may remain).', 1: 'The spec is missing something it needs.' },
  },
  'spec render': {
    summary: 'Preview the visual page of a spec Markdown file: render it and write the HTML, with no session and no platform.',
    flags: { 'md-file': 'Path to the spec Markdown.', out: 'Where to write the HTML. Left out, beside the Markdown with .html.' },
    required: ['--md-file'],
    input: { flag: 'md-file', format: 'markdown', description: SPEC_MD_NOTE },
    exitCodes: { 0: 'The page was written and passes its own check.', 1: 'The Markdown was refused, or the page was written but fails its own check.' },
  },
  'spec draft': {
    summary: 'Write the final spec draft (technical Markdown, and with --html the visual page rendered from it) into this session, and open the page when there is one.',
    flags: { title: 'Spec title. Its slug names the draft.', 'md-file': 'Path to the technical Markdown.', html: 'Boolean. Also render the visual page from the Markdown. Only when the person asked for it.' },
    required: ['--title', '--md-file'],
    input: { flag: 'md-file', format: 'markdown', description: SPEC_MD_NOTE },
    notes: ['With --html, every ## Touches entity needs its own "### <kind> · <name>" heading in ## Contract, and each Calls, Opens, Reads, Writes or Uses bullet must name a Touches entity of its kind; without --html these are only warnings.'],
  },
  'spec accept': {
    summary: 'Accept a drafted final spec and write the solution_spec record.',
    flags: {
      draft: 'Draft slug from spec draft.',
      'ask-before-deploy': 'Boolean. Ask again before any deploy or publish task runs. This is the default, except for the Ready when lines a plan propose preview showed.',
      'no-ask-before-deploy': 'Boolean. Run deploy and publish tasks without asking again. Only when the person said so.',
      'derived-from': 'Spec id this spec replaces after a requirement change.',
    },
    required: ['--draft'],
    notes: ['spec accept and fast accept are one path. The record keeps mode (the session mode, sonic by default) and format: spec. A draft left from before, in the old brief format, is still accepted.'],
  },
  'spec revise': {
    summary: 'Replace the Markdown, and with --html the visual page rendered from it, of an accepted spec, with a revision note.',
    args: [{ name: '<specId>', description: 'The accepted spec to revise.' }],
    flags: { 'md-file': 'Path to the new technical Markdown.', html: 'Boolean. Render the visual page again from the new Markdown. Left out, the spec keeps no page.', note: 'Why the spec changed.' },
    required: ['<specId>', '--md-file', '--note'],
    input: { flag: 'md-file', format: 'markdown', description: SPEC_MD_NOTE },
  },
  'spec get': { summary: 'Fetch one spec of this solution and render it into the folder.', args: [{ name: '<specId>', description: 'Spec id.' }], flags: {}, required: ['<specId>'] },
  'spec list': { summary: 'List the cached specs of this solution.', flags: {} },
  'fast brief': {
    summary: 'The same draft as spec draft, with no HTML. New text uses the spec headings; the old brief format (## Goal, ## Changes) is refused.',
    flags: { title: 'Title. Its slug names the draft.', 'md-file': 'Path to the spec Markdown.' },
    required: ['--title', '--md-file'],
    input: { flag: 'md-file', format: 'markdown', description: SPEC_MD_NOTE },
  },
  'fast accept': {
    summary: 'The same accept as spec accept, plus --execution.',
    flags: {
      draft: 'Draft slug from fast brief or spec draft.',
      'ask-before-deploy': 'Boolean. Ask again before any deploy or publish task runs. This is the default, except for the Ready when lines a plan propose preview showed.',
      'no-ask-before-deploy': 'Boolean. Run deploy and publish tasks without asking again. Only when the person said so.',
      'derived-from': 'Spec id this brief replaces.',
      execution: 'Optional. plan is the only value: a brief is always followed by a plan. Kept on the session; solution context returns it as execution.',
    },
    required: ['--draft'],
  },
  'entity read': {
    summary: 'Read one entity, or several, from the tenant, link them to the solution and cache their version snapshots.',
    args: [
      { name: '<kind>', description: 'object, automation, ai-agent, app, page or code-app.' },
      { name: '<id>', description: 'Platform id of the entity, or several ids of one kind as a comma list, such as OBJ_a,OBJ_b.' },
    ],
    flags: {
      name: 'Entity name to record with the snapshot.',
      'app-id': 'Owning app id, required for a page: a page is read through its app.',
      source: 'Why this read happened, recorded on the snapshot. Defaults to read.',
    },
    required: ['<kind>', '<id>'],
    notes: ['Several ids are read a few at a time and linked in one solution write, so linking entities that already exist needs no plan task. An id that cannot be read is named in failed and not linked, and the exit code is then 1.',
      'An ai-agent is read, cached and linked the way an object or an automation is. The record holds the agent itself; its tools, skills, tasks and knowledge are separate entities only get_agent answers.'],
  },
  'entity context': {
    summary: 'Answer from the local cache without a tenant call: the whole solution, one app with its pages and data sources, one page, one object, one automation, or one AI agent.',
    args: [
      { name: '<kind>', description: 'solution, app, page, object, automation or ai-agent.' },
      { name: '<id>', description: 'Platform id of the app, page, object, automation or AI agent, or its name; none for solution.' },
    ],
    flags: {
      'app-id': 'Owning interface id or name, required for page.',
      name: 'The entity\'s name instead of its id, for a task that creates it and has no id yet. A name the cache does not hold answers miss.',
      save: 'Boolean. On a hit, write the whole answer to .sessions/<sessionId>/reads/<kind>-<id>.json and print only its status, the id, name and version it holds, and that file. A page answer is about 140 KB, more than one Bash reply shows.',
    },
    required: ['<kind>'],
    notes: [
      'hit carries the cached body and when it was read; miss means the cache has no copy; stale means a write went out since the last refresh.',
      'An entity is named by its id or by its name in any letter case. A name that fits two cached entities is refused with their ids.',
      'With --save the file is named after the entity, so builders that run side by side never read each other\'s copy. A miss or stale answer is small, writes no file, and removes the file an earlier hit saved under that name, since it holds the copy from before.',
      'A miss or stale result means use the surface tools the message names. An app hit lists its stale pages; a solution hit lists every stale entry. Cache data is never write proof.',
      'A page hit also carries the owning app\'s own record, under appInterface (never interface): its properties.customCode is app-wide, not the page\'s own.',
    ],
  },
  'entity list': { summary: 'List the cached entity version snapshots of this solution.', flags: {} },
  'cache app': {
    summary: 'The pages of one app with their block, variable and data source counts, its type, device, mode (code or config) and access (PUBLIC or PRIVATE), and what the app has deployed — get_app_overview from the local snapshot, plus the mode and access no tool reads.',
    args: [{ name: '<app>', description: "The app's id, or the name the platform shows. Optional when --app-id is given instead." }],
    flags: { 'app-id': "The app, in place of the positional <app>: its id, or the name the platform shows.",
      refresh: 'Boolean. Re-read this entity from the tenant first, then answer from the fresh copy. Also runs first when the app is not cached yet, so a brand-new app still resolves. The only network call in the cache area; it links nothing and writes nothing to the tenant.' },
    notes: ['Give the app positionally or with --app-id, never neither. Reads no tenant. The first line of the output names the version read and when that copy was validated.'],
  },
  'cache nav': {
    summary: "The app's menu — every primary and secondary item with its type, icon and the page, URL or module it opens — plus the default page and each device's navigator, with the module that draws it when one does. get_navigation from the local snapshot.",
    args: [{ name: '<app>', description: "The app's id, or the name the platform shows. Optional when --app-id is given instead." }],
    flags: { 'app-id': "The app, in place of the positional <app>: its id, or the name the platform shows.",
      refresh: 'Boolean. Re-read this entity from the tenant first, then answer from the fresh copy. Also runs first when the app is not cached yet, so a brand-new app still resolves. The only network call in the cache area; it links nothing and writes nothing to the tenant.' },
    notes: ['Give the app positionally or with --app-id, never neither.'],
  },
  'cache paths': {
    summary: "Every page's path — its folder's path plus its slug — with the folder tree, public pages, pages no folder holds and two pages at one path. get_page_paths from the local snapshot.",
    args: [{ name: '<app>', description: "The app's id, or the name the platform shows. Optional when --app-id is given instead." }],
    flags: { 'app-id': "The app, in place of the positional <app>: its id, or the name the platform shows.",
      refresh: 'Boolean. Re-read this entity from the tenant first, then answer from the fresh copy. Also runs first when the app is not cached yet, so a brand-new app still resolves. The only network call in the cache area; it links nothing and writes nothing to the tenant.' },
    notes: ['Give the app positionally or with --app-id, never neither.'],
  },
  'cache page': {
    summary: 'One page as counts and names: blocks by component type, its variables, its layout slots and its data sources.',
    args: [{name: "<page>", description: "The page's id, the slug in its builder URL, or its name."}],
    flags: { 'app-id': 'Owning app: its id, or the name the platform shows.', refresh: 'Boolean. Re-read this entity from the tenant first, then answer from the fresh copy. The only network call in the cache area; it links nothing and writes nothing to the tenant.' },
    required: ['--app-id', '<page>'],
  },
  'cache outline': {
    summary: 'The parentId tree of a page as componentType and displayName, each block\'s children in their stored content.blockIds order, then its slots — get_page_outlines view=tree from the local snapshot.',
    args: [{name: "<page>", description: "The page's id, the slug in its builder URL, or its name."}],
    flags: {
      'app-id': 'Owning app: its id, or the name the platform shows.',
      root: 'Block id to start the tree at. Without it every root block of the page is shown.',
      depth: 'How many levels below the root to show. Without it the whole tree is shown.',
      refresh: 'Boolean. Re-read this entity from the tenant first, then answer from the fresh copy. The only network call in the cache area; it links nothing and writes nothing to the tenant.',
    },
    required: ['--app-id', '<page>'],
  },
  'cache blocks': {
    summary: 'The blocks of a page by displayName, id or pattern — get_blocks, which takes ids only, resolved by name from the local snapshot.',
    args: [{name: "<page>", description: "The page's id, the slug in its builder URL, or its name."}],
    flags: {
      'app-id': 'Owning app: its id, or the name the platform shows.',
      name: "A block's exact displayName.",
      id: "A block's id, such as b_VZZj0, or several separated by commas, such as b_VZZj0,b_OZxpE. An id not on the page is named under notFound.",
      ids: 'Same as --id: the plural alias, for a comma-separated list of block ids.',
      match: 'Regular expression matched against displayName and componentType.',
      field: 'Print only this path of each matched block, such as component.appearance or visibility.',
      limit: 'How many matched blocks to print. Default 10, or every id an --id list names.',
      refresh: 'Boolean. Re-read this entity from the tenant first, then answer from the fresh copy. The only network call in the cache area; it links nothing and writes nothing to the tenant.',
    },
    required: ['--app-id', '<page>'],
    notes: ['Needs one of --name, --id, --match or --field. A whole page is what cache outline is for.'],
  },
  'cache grep': {
    summary: 'Every block, page function, page variable and data source of every cached page whose text, name, binding or config matches a pattern — search_app across apps, with no round trip.',
    args: [{ name: '<pattern>', description: 'Regular expression, matched case-insensitively against every string in each block.' }],
    flags: {
      'app-id': 'Owning app: its id, or the name the platform shows. Without it every cached app of this solution is scanned.',
      field: 'Search only this path of each block, such as component.appearance.',
      limit: 'How many hits to print. Default 50.',
      refresh: 'Boolean. Re-read this entity from the tenant first, then answer from the fresh copy. The only network call in the cache area; it links nothing and writes nothing to the tenant. Needs --app-id.',
    },
    required: ['<pattern>'],
    notes: ['At most three hits per block, so one block cannot fill the answer; the count still reports the rest.'],
  },
  'cache ds': {
    summary: 'The data sources of a page with the automation each calls, its parameters, and the blocks that consume it — get_data_sources from the local snapshot.',
    args: [{name: "<page>", description: "The page's id, the slug in its builder URL, or its name. Leave it out to list the data sources of every cached page of the app."}],
    flags: {
      'app-id': 'Owning app: its id, or the name the platform shows.',
      name: 'One data source by its name: printed in full, with what each parameter is bound to. Without a page, every cached page of the app is searched.',
      id: 'One data source by its id, printed the same way.',
      refresh: 'Boolean. Re-read this entity from the tenant first, then answer from the fresh copy. The only network call in the cache area; it links nothing and writes nothing to the tenant.',
    },
    required: ['--app-id'],
  },
  'cache deps': {
    summary: 'The edges a page declares, from every block dpOn and dataSourceIds — get_dependency_graph from the local snapshot, without its dangling references, which only get_dependency_graph reads.',
    args: [{name: "<page>", description: "The page's id, the slug in its builder URL, or its name."}],
    flags: { 'app-id': 'Owning app: its id, or the name the platform shows.', refresh: 'Boolean. Re-read this entity from the tenant first, then answer from the fresh copy. The only network call in the cache area; it links nothing and writes nothing to the tenant.' },
    required: ['--app-id', '<page>'],
  },
  'cache events': {
    summary: 'Every event chain on a page — the page\'s own events (such as onPageLoad), each block\'s events and each data source\'s success and failure callbacks — with the action type and its target by name. The event half of get_blocks and get_data_sources, from the local snapshot.',
    args: [{name: "<page>", description: "The page's id, the slug in its builder URL, or its name."}],
    flags: {
      'app-id': 'Owning app: its id, or the name the platform shows.',
      name: 'One block or data source, by displayName or id: its events and every chain its actions lead to, such as a button, the form it submits and the data source that form triggers.',
      refresh: 'Boolean. Re-read this entity from the tenant first, then answer from the fresh copy. The only network call in the cache area; it links nothing and writes nothing to the tenant.',
    },
    required: ['--app-id', '<page>'],
  },
  'cache form': {
    summary: 'Each Form block\'s fields in order, with type, label, widget, required, limits, lookup data source and the binding that reads each. list_form_fields from the local snapshot.',
    args: [{name: "<page>", description: "The page's id, the slug in its builder URL, or its name."}],
    flags: { 'app-id': 'Owning app: its id, or the name the platform shows.', block: 'One Form block, by displayName or id. Without it every Form on the page is shown.', refresh: 'Boolean. Re-read this entity from the tenant first, then answer from the fresh copy. The only network call in the cache area; it links nothing and writes nothing to the tenant.' },
    required: ['--app-id', '<page>'],
    notes: ['A form whose fields come from another source than its own schema shows no fields here; list_form_fields reads those.'],
  },
  'cache keys': {
    summary: 'The names a binding on a page can read that the snapshot holds — page variables and functions, page and app data sources, form fields — each with its expression.',
    args: [{name: "<page>", description: "The page's id, the slug in its builder URL, or its name."}],
    flags: { 'app-id': 'Owning app: its id, or the name the platform shows.', name: 'One page function or variable, by its name or id, printed whole: a function with its body.', refresh: 'Boolean. Re-read this entity from the tenant first, then answer from the fresh copy. The only network call in the cache area; it links nothing and writes nothing to the tenant.' },
    required: ['--app-id', '<page>'],
    notes: ['Not in the cache: the keys inside a data source\'s data (get_data_source_output_schemas), the keys a block exposes of itself (the block\'s knowledge sheet), and storage keys, page inputs and params, user attributes and environment variable names (get_context_keys).'],
  },
  'cache obj': {
    summary: 'One storage object: its fields with types, formats, picklist codes, lookup targets, required and query flags, and its indexes — get_objects and describe_storage_object from the local snapshot.',
    args: [{ name: '<object>', description: 'The object id, such as OBJ_mcp_tool_usage, or its name. A name the cache does not hold answers miss.' }],
    flags: { refresh: 'Boolean. Re-read this entity from the tenant first, then answer from the fresh copy. The only network call in the cache area; it links nothing and writes nothing to the tenant.' },
    required: ['<object>'],
  },
  'cache agent': {
    summary: 'One AI agent: its type, description, role and goal, its instructions, the models it runs on, its default tools, the switches the tenant set, the memory switch and conversation starters when the record holds them, and what is deployed — the agent record get_agent reads, from the local snapshot.',
    args: [{ name: '<agent>', description: 'The agent id, as entity context solution lists it, or its name. A name the cache does not hold answers miss.' }],
    flags: { refresh: 'Boolean. Re-read this entity from the tenant first, then answer from the fresh copy. The only network call in the cache area; it links nothing and writes nothing to the tenant.' },
    required: ['<agent>'],
    notes: ['The record is the agent itself. Its attached tools, skills, knowledge, tasks, guardrails, deployments and traces are separate entities: read them live with get_agent, list_capabilities, get_knowledge_sets, check_knowledge_status, list_tasks, read_guardrails, list_deployments and read_trace. The answer names them so an absent field is not read as none attached.',
      'Instructions and the goal are shown as a preview with their length; the whole text is in entity context ai-agent.'],
  },
  'cache wf': {
    summary: 'One automation: its nodes with titles and resources, its trigger with its inputs and outputs, and what is deployed — the code open_workflow reads and the deploy state search_workflows reads, from the local snapshot, without the TypeScript source.',
    args: [{ name: '<automation>', description: 'The automation id, as entity context solution lists it, or its name. A name the cache does not hold answers miss.' }],
    flags: {
      contract: 'Boolean. Only the contract: each input and output with its type and required flag, and every answer the automation can give. describe_callable_workflow from the local snapshot.',
      deps: 'Boolean. Only the dependencies: the automations it calls, the objects it reads and writes, its connectors and connections, and the cached data sources and automations that call it. get_workflow_dependencies from the local snapshot.',
      refresh: 'Boolean. Re-read this entity from the tenant first, then answer from the fresh copy. The only network call in the cache area; it links nothing and writes nothing to the tenant.',
    },
    required: ['<automation>'],
    notes: ['The source a change is written against is open_workflow; the cache holds the saved nodes, not the TypeScript.', 'With --deps, callers outside this solution\'s cache are not listed.'],
  },
  'cache diff': {
    summary: 'Two cached versions of one page, block by block: what was added, removed and changed. No tenant tool answers this.',
    args: [{name: "<page>", description: "The page's id, the slug in its builder URL, or its name."}],
    flags: {
      'app-id': 'Owning app: its id, or the name the platform shows.',
      versions: 'Two cached version numbers, newest first or in any order, as 1732,1731. Without it the two newest cached versions are compared.',
    },
    required: ['--app-id', '<page>'],
    notes: ['Each cached version is its own immutable file, so this is the local history of the page: the newest 10 are kept.'],
  },
  'cache limits': {
    summary: 'What the cache never holds and which tool owns each, so a reader stops guessing at an answer no snapshot can give.',
    flags: {},
  },
  'impact automation': {
    summary: 'What else a change to this automation affects, from the cached wiring: each entity part that uses it, why, which builder agent owns the fix, and found, no-change or unknown. Reads the cache only; no tenant call.',
    args: [{ name: '<automation>', description: 'Its id or its name.' }],
    flags: { change: 'output, input, field-rename, field-delete, delete or logic. Without it, every user is listed as affected.' },
    required: ['<automation>'],
    notes: ['A stale or uncached page or automation, and every AI agent, is listed as unknown rather than left out. The same wiring is in .nebula/solution-map.md.'],
  },
  'impact object': {
    summary: 'What else a change to this object affects, from the cached wiring: each entity part that uses it, why, which builder agent owns the fix, and found, no-change or unknown. Reads the cache only; no tenant call.',
    args: [{ name: '<object>', description: 'Its id or its name.' }],
    flags: { change: 'output, input, field-rename, field-delete, delete or logic. Without it, every user is listed as affected.' },
    required: ['<object>'],
    notes: ['A stale or uncached page or automation, and every AI agent, is listed as unknown rather than left out. The same wiring is in .nebula/solution-map.md.'],
  },
  'impact page': {
    summary: 'What else a change to this page affects, from the cached wiring: each entity part that uses it, why, which builder agent owns the fix, and found, no-change or unknown. Reads the cache only; no tenant call.',
    args: [{ name: '<page>', description: 'Its id or its name, or the slug in its builder URL.' }],
    flags: { 'app-id': 'Owning app: its id or name. Needed only when two cached apps have a page of that name.', change: 'output, input, field-rename, field-delete, delete or logic. Without it, every user is listed as affected.' },
    required: ['<page>'],
    notes: ['A stale or uncached page or automation, and every AI agent, is listed as unknown rather than left out. The same wiring is in .nebula/solution-map.md.'],
  },
  'impact app': {
    summary: 'What else a change to this app affects, from the cached wiring: each entity part that uses it, why, which builder agent owns the fix, and found, no-change or unknown. Reads the cache only; no tenant call.',
    args: [{ name: '<app>', description: 'Its id or its name.' }],
    flags: { change: 'output, input, field-rename, field-delete, delete or logic. Without it, every user is listed as affected.' },
    required: ['<app>'],
    notes: ['A stale or uncached page or automation, and every AI agent, is listed as unknown rather than left out. The same wiring is in .nebula/solution-map.md.'],
  },
  'impact ai-agent': {
    summary: 'What else a change to this ai-agent affects, from the cached wiring: each entity part that uses it, why, which builder agent owns the fix, and found, no-change or unknown. Reads the cache only; no tenant call.',
    args: [{ name: '<ai-agent>', description: 'Its id or its name.' }],
    flags: { change: 'output, input, field-rename, field-delete, delete or logic. Without it, every user is listed as affected.' },
    required: ['<ai-agent>'],
    notes: ['A stale or uncached page or automation, and every AI agent, is listed as unknown rather than left out. The same wiring is in .nebula/solution-map.md.'],
  },
  'entity link': {
    summary: 'Print the platform link for one entity, or with --refs the links and the entity table of several, for a build done outside a plan. An app, code-app or page also gets its preview link, the live view to open in the Claude desktop browser pane.',
    args: [
      { name: '<kind>', description: 'object, record, automation, app, code-app, page, connection, ai-agent, knowledge-set, dataset, metric, experiment, api_group, api, client, access_profile, policy, env_variable, connector, solution or changeset.' },
      { name: '<id>', description: 'Platform id of the entity.' },
    ],
    flags: {
      'app-id': 'Owning app id, required for a page.',
      'object-id': 'Owning object id, required for a record.',
      'group-id': 'Owning API Group id, required for an api.',
      'client-id': 'Owning client id, required for an access_profile.',
      refs: 'JSON list of {kind, id, name?, appId?, objectId?, groupId?, clientId?, status?}: every entity of a change in one call. Returns links and entityTable, the table a plan finish shows.',
    },
    required: ['<kind>', '<id>'],
  },
  'plan propose': {
    summary: 'Check a change (spec Markdown and its tasks) and keep it on the session as pendingSave. With --preview, also write its preview page and open it. With --save --hash, save exactly that change: spec draft, spec accept, then plan create. With --go, save it and start the plan in one call. Its one tenant read is the solution\'s plans, to name another person\'s running plan on the same entity; when that read fails it says so in one line and uses the local copy.',
    flags: {
      file: 'Path to the spec Markdown (the spec headings, page design lines in ## Contract).',
      'tasks-file': 'Path to the task graph JSON, the same shape plan create takes.',
      save: 'Boolean. Save the change plan propose checked. Needs --hash.',
      go: 'Boolean. Check, save and start the plan in one call, after the person said yes in chat. Needs no --hash and writes no preview. Not with --save or --hash.',
      preview: 'Boolean. With --file. Write the preview page and open it.',
      hash: 'With --save. The hash plan propose printed. A change whose text changed since is refused.',
      request: 'A short change, instead of --file: the change in the person\'s words. Goes with --task.',
      task: 'With --request. One task as a JSON object, or several as a JSON array. Each is on an existing entity (kind, name and id given) and deletes nothing. The spec is built from the request: each entity once in Touches, and a Ready when line for each proof and each deploy or publish.',
      mode: 'Optional. zen for a /ua:plan plan, else sonic. Kept on the session and the records only.',
      'derived-from': 'Optional. Spec id this plan\'s spec replaces after a requirement change. The new spec and its plan record lineage to the old spec and its newest plan. Part of the hash.',
      'evidence-file': 'With --save or --go. Path to a JSON array of plan-review evidence lines, passed to plan create.',
    },
    input: { flag: 'tasks-file', format: 'json', description: 'The task graph, same shape as plan create.', fields: TASK_FIELDS, example: TASK_EXAMPLE },
    exitCodes: { 0: 'The change passed its checks (and with --save, was saved; with --go, was saved and started).', 1: 'A spec or task check failed; the reason is in the error.' },
    notes: [
      'With --preview, the preview is .sessions/<sessionId>/drafts/preview-<hash>.html. It is opened in the default browser on macOS and its path is printed. Without --preview, previewPath is null.',
      'The yes to the change covers the deploy and publish lines of its ## Ready when. Any other release, and every delete, still asks through plan confirm.',
      '--save and --go run one solution sync for the whole chain. Both are safe to run again after a failure at any step: spec accept and plan create keep receipts, and pendingSave keeps the accepted spec id until the plan is saved.',
      'A short change (--request with --task) writes no preview; its spec and task files go in drafts as plan-<hash>.md and tasks-<hash>.json.',
      'cacheWarnings lists task facts the solution\'s cache disagrees with: a page id its app does not hold, a block name that is not the name of the block id beside it (saveButton (b_x)), and an app type a READ row gives that the cached app does not have. Each is a warning, never a refusal, and comes only from a copy the cache holds as current: fix the task, or read live when the cache may be old.',
    ],
  },
  'plan create': {
    summary: 'Create the builder plan for an accepted spec from a validated task graph.',
    flags: {
      spec: 'Spec id the plan implements. The spec must be an accepted spec.',
      'tasks-file': 'Path to the task graph JSON.',
      'evidence-file': 'Path to a JSON array of plan-review evidence lines.',
      'derived-from': 'Plan id this plan replaces. Its done tasks are recorded on the new plan as carried forward and are not run again only when the tasks file leaves them out: the file holds just the work still to do.',
    },
    required: ['--spec', '--tasks-file'],
    input: {
      flag: 'tasks-file', format: 'json', description: 'A JSON array of tasks. At least one task, ids t1…tN, acyclic dependsOn, and no two tasks of the same kind on the same entity unless one depends on the other.',
      fields: TASK_FIELDS, example: TASK_EXAMPLE,
    },
    notes: [
      'agent, status, attempts and result are set here; do not supply them.',
      'A deploy, publish or code-publish task needs its exact entity name in the spec\'s ## Ready when (a code-publish as publish <app>).',
      '--evidence-file holds a JSON array of strings, e.g. ["Read object list: Task not found."].',
      'The tenant can answer an error after it saved the plan. The create keeps a receipt in the session state first, so running the same create again finds that plan instead of saving a second one. While the tenant does not list it yet, the rerun stops with exit 6 for up to 10 minutes.',
    ],
  },
  'plan revise': {
    summary: 'Update the stored plan with a new task graph, keeping completed tasks intact.',
    args: [{ name: '<planId>', description: 'The plan to revise.' }],
    flags: {
      'tasks-file': 'Path to the task graph JSON: every task that is not done. Done tasks may be left out; plan revise keeps them as the plan stored them.',
      'evidence-file': 'Path to a JSON array of evidence lines to add.',
      reason: 'Why the graph changed.',
      impact: 'absorbed or major. absorbed is refused when more than half of the remaining tasks change their kind, entity or dependsOn, more than two tasks are added, a new surface type appears, or a deploy, publish or automation-shell is added or changes its kind, entity or dependsOn. A change to title, body or proof alone does not count, nor an entity id that a done task reported, nor a release that only waits on a task this revise adds. The tasks file holds the tasks still to do; a done or skipped task it leaves out stays as stored, and a pending task it leaves out is removed, which the reply names.',
      'ready-when': 'With --impact major only, after the person said yes to a release the accepted spec does not name. One or more "deploy <automation>" or "publish <app>" lines, separated by semicolons, each naming the entity of a deploy or publish task in the tasks file. They are added to the accepted spec\'s ## Ready when, with a ## Touches line for an entity it does not hold yet, and the spec keeps them under readyWhenAdded with the person\'s words, who ran the command and when.',
      'release-yes': 'Required with --ready-when: the person\'s own words of yes to those releases.',
    },
    required: ['<planId>', '--tasks-file', '--reason', '--impact'],
    input: { flag: 'tasks-file', format: 'json', description: 'The tasks that are not done, same shape as plan create. dependsOn may name a done task. A done task the file still lists must say the same thing as the stored one; only its entity id may differ, and the stored copy is kept.', fields: TASK_FIELDS, example: TASK_EXAMPLE },
  },
  'plan audit': {
    summary: 'Record a page quality audit on the plan and insert its fix tasks ahead of the publish.',
    args: [{ name: '<planId>', description: 'The plan whose MOBILE pages the page quality pass audited.' }],
    flags: {
      file: 'Path to the findings JSON the pass wrote: { pages: [{ id, name, unaudited? }], summary: { blocking, advisory }, findings, accepted }. blocking and advisory count the findings still open. A page the script could not audit, sent out on the person\'s yes, carries unaudited: { reason, words } with their own words and no findings. accepted is always { findings, decision, words }: findings are the advisory findings the person declined; decision and words are null, except after round 2 with blocking findings open, when decision is fix-by-hand, accept-and-publish or finish-without-publishing and words are the person\'s own. A decision with no words, or any other shape, is a usage error.',
      'tasks-file': 'Path to a JSON array of quality fix tasks, one per page with findings to fix. Leave it out when there is nothing to fix.',
    },
    required: ['<planId>', '--file'],
    input: {
      flag: 'tasks-file', format: 'json', description: 'Quality fix tasks. Each is a page-bind marked audit: true, with a new q<n> id, on a page this audit covers, with no deletes. Each fix task is then checked the way plan create checks a task (no placeholder, a named entity, only tools the app agent can call), and the plan they make may hold no cycle and no problem the stored plan did not already have: a stored task that fails a check added since it was made never blocks an audit. Anything else is refused with the rule it broke, and nothing is stored. No fix task is ever judged by a page review: it runs after the review.',
      fields: QUALITY_TASK_FIELDS, example: QUALITY_TASK_EXAMPLE,
    },
    notes: [
      'meta.audits gains { revision, at, pages, coveredTasks, summary, findings, accepted, tasks, publishedBefore }. coveredTasks are the done page-layout and page-bind tasks of MOBILE apps (quality fix tasks left out) when it runs, each with a page id the plan knows: its own, the one its result reported (ids.entity or ids.page), or one another task of the same page holds; a task with none is left out and asks for no page. tasks are the ids it added; publishedBefore are the publish tasks already done of an app that owns one of those pages, which it leaves as they ran.',
      'It is refused while a page task, a page review or a quality fix task of the plan is pending or running: a review can still send its page back to the builder.',
      '--file pages must include every page of those done page tasks; a file that leaves one out is a usage error naming it.',
      'Each fix task is added pending with no attempts spent, and waits on every task already on its page, its page review included. Each publish not yet done of an app that owns an audited page waits on the fix tasks on that app\'s pages; a deploy, an AI agent\'s publish and another app\'s publish never do. meta.revision goes up by one, and revisionHistory gains { revision, at, impact: "quality", added }.',
      'This is the one change to a plan\'s tasks that the absorbed and major rules of plan revise do not govern: what it may add is only the fix tasks above.',
      'An audit is settled when every fix task it added is done and either no blocking finding is open or accepted.decision is accept-and-publish. fix-by-hand leaves it open, so the pass runs again before the publish; after finish-without-publishing the session skips the publish task. A later audit of the same pages with nothing open and no tasks file is recorded the same way, never refused.',
      'An audit covers each page task as it was when the audit ran: a covered task done again later (a review sent it back) is covered no more, so the hold comes back and the pass is asked again for its page.',
      'A plan fork carries every settled audit, the person\'s accept-and-publish words included, for the tasks it carries, so the pass is not asked again for that work.',
    ],
  },
  'plan fork': {
    summary: 'Create a replacement plan under the same spec and interrupt the predecessor.',
    args: [{ name: '<planId>', description: 'The plan being replaced.' }],
    flags: { 'tasks-file': 'Path to the replacement task graph JSON.', 'evidence-file': 'Path to a JSON array of evidence lines.', reason: 'Why the plan is replaced.' },
    required: ['<planId>', '--tasks-file', '--reason'],
    input: { flag: 'tasks-file', format: 'json', description: 'The replacement task graph, same shape as plan create.', fields: TASK_FIELDS, example: TASK_EXAMPLE },
    notes: ['The source\'s done tasks are carried as meta.carriedForward and count as carried:<taskId> in the page quality pass, with every settled audit of the source that covers them, so the pass is not asked again for work it already settled.'],
  },
  'plan interrupt': {
    summary: 'Stop a planned or in-progress plan and record why.',
    args: [{ name: '<planId>', description: 'The plan to interrupt.' }],
    flags: { reason: 'Why the plan stopped.' },
    required: ['<planId>', '--reason'],
  },
  'plan start': { summary: 'Start a planned plan and make this session its runner.', args: [{ name: '<planId>', description: 'The plan to start.' }], flags: {}, required: ['<planId>'] },
  'plan resume': {
    summary: 'Resume a failed, interrupted or stale plan: reset unfinished tasks, clear saved yeses, and start it in this session.',
    args: [{ name: '<planId>', description: 'The plan to resume.' }], flags: {}, required: ['<planId>'],
  },
  'plan mark-failed': {
    summary: 'Mark a stale in-progress plan you own as failed.',
    args: [{ name: '<planId>', description: 'The plan to mark failed.' }],
    flags: { reason: 'Why the plan failed.' },
    required: ['<planId>', '--reason'],
  },
  'plan ready': {
    summary: 'Re-fetch the plan and group its ready work into one batch per builder agent (app work: one batch per page, each on a new agent unless it is a retry; code app work: one batch per app, back to the agent that last worked on it), with the deploys and publishes waiting for a yes and the manual tasks. While a done page task of a MOBILE app has no settled page quality audit, the publish of that page\'s app is held: heldForQuality names each held publish that would otherwise be ready (an AI agent\'s or another app\'s publish is not held), and progress ends with · page quality pending. next is exactly the one pass line once it is the only step left: every page task, page review and quality fix task of the plan settled, no batch to send, nothing to ask, nothing running or waiting. A plain call with no --mark returns the same next and progress.',
    args: [{ name: '<planId>', description: 'The running plan.' }],
    flags: { mark: 'Boolean. Also mark every batch that needs no answer running in one write, write each batch\'s message file, and reply with send, ask, progress and the exact next calls.',
      'agent-ids': 'With --mark. The agentId each Agent() call returned since the last plan ready, as <agentName>=<agentId> pairs separated by commas. They are kept in the session state, and a later resume sends to that id instead of the name.',
      'no-resume': 'Boolean. With --mark. This Claude session has no SendMessage (no such tool, or it is disabled). The session state keeps it, and from then on every batch starts a new agent with a new name, so next holds only Agent() calls.',
      spread: 'Boolean. With --mark. The person asked for this plan\'s work to run in parallel: each fde-agent, automation-agent and agent-builder batch then holds one task, so ready tasks go to more agents at once, up to the cap. The session state keeps it for this plan.' },
    required: ['<planId>'],
    exitCodes: { 0: 'The plan is in progress; batches (or send, with --mark) holds the work to send.', 5: 'The plan is not in progress; stop sending work.' },
    notes: ['A batch names its agent. resume is true when this Claude session already started that agent.',
      'busy lists the agents that still hold running tasks; wait for their reports before taking anything back.',
      'Without --mark it changes nothing, so it is the read for a progress question: its progress line is the one --mark would give.',
      'At most 6 builder agents work at once in one Claude session, of every kind and in every plan it runs (AGENTS_AT_ONCE). A batch holds at most 10 tasks, or one with --spread. When every agent allowed is busy, the reply says full and next says to wait.',
      'With --mark: each message goes to .sessions/<sessionId>/batches/<agentName>-<k>.md, a name no other session of this folder uses, and its report file is the same name ending .report.json. next lists the exact Agent or SendMessage calls (a resume goes to the agent id --agent-ids saved, or to the name when none is saved), then one line per question for the person. A batch holding a task with an open question is not sent; the question is in ask. The reply carries no task body and no entity table.'],
  },
  'plan task': {
    summary: 'Mark a batch running for one named agent, record a task as done, failed or skipped, or save the person\'s answer to a task\'s question.',
    args: [{ name: '<planId>', description: 'The running plan.' }, { name: '<taskIds>', description: 'One task id, or several for running or skipped: a comma list such as t1,t2,t3, or the ids as separate words.' }],
    flags: {
      status: 'running, done, failed or skipped. Required unless --answer is given.',
      'result-file': 'Path to the task result JSON. Supply it with done.',
      error: 'Why the task failed or was skipped.',
      'agent-name': 'The agent that takes the batch, as plan ready named it. Required with running.',
      answer: 'The person\'s answer to a pending task\'s question, or their new words for a pending or running task. One task, no --status. It replaces any older answer, and the next message for that task carries it; a running task\'s message file is written again with it. It does not save a delete\'s or a release\'s yes: that is plan confirm, and the reply says so when that gate is still open.',
    },
    required: ['<planId>', '<taskIds>'],
    input: {
      flag: 'result-file', format: 'json', description: 'One task result as JSON. All four keys are required; readBack must quote a real line. A manual task that names an entity must name it, or one of its ids, in that line; a generic confirmation is refused. A task that names none (a pure decision or investigation) takes a generic line.',
      fields: RESULT_FIELDS,
      example: { ids: { entity: 'e_1234' }, readBack: ['object get Task: fields name, description'], unverified: [], notes: [] },
    },
    notes: ['running needs every task pending and for one agent, with each dependency done or in the same call. A deploy or publish needs its dependencies done, and a yes from plan confirm when the plan asks first. A task that deletes needs its dependencies done and a yes from plan confirm, always.',
      'Each running mark spends one of the two attempts per task. A failed or skipped task skips everything downstream, and alsoSkipped lists those tasks.',
      'done, failed and skipped take only pending tasks. A running task belongs to its agent: record it with plan report, or take it back with plan reclaim.',
      'A publish the page quality pass holds is refused for running and done, naming the pass: run it and record it with plan audit first. skipped still takes it, which is how the person finishes without publishing.',
      '--answer takes a pending task. It saves the answer, replacing any older one, and clears a question, so plan ready --mark sends the task again.',
      '--answer also takes a running task, such as one plan ready --mark just marked. It writes that batch\'s message file again with the answer in it. When the message was already sent, the reply says to tell the agent with SendMessage.',
      'The reply names each task by id, title and status, never its body.'],
  },
  'plan report': {
    summary: 'Record a builder agent\'s whole report in one write. The builder runs it itself, with the command its message names.',
    args: [{ name: '<planId>', description: 'The running plan.' }],
    flags: {
      'agent-name': 'The agent whose running batch this report answers.',
      'report-file': 'Path to the report JSON: the report file the builder wrote, or, when the builder could not record it, the last fenced json block of its reply ({} when there was none). With {}, the builder\'s own report file for this batch is read when it wrote one.',
      'usage-limit': 'Boolean. With a {} report only. The builder stopped at the usage limit (an HTTP 429, or a reply that says the usage or rate limit was reached). Every task it did not settle is handed back with its attempt given back, and the stop never counts toward the hand-backs that fail a task.',
    },
    required: ['<planId>', '--agent-name', '--report-file'],
    input: {
      flag: 'report-file', format: 'json', description: 'The agent report, one entry per task it was given.',
      fields: REPORT_FIELDS,
      example: { tasks: [{ id: 't1', status: 'ok', change: 'created', ids: { entity: 'e_1234' }, readBack: ['object get Task: fields name, description'], unverified: [], notes: [], error: '' }] },
    },
    exitCodes: { 0: 'The report was recorded.', 1: 'The report was refused: nothing was recorded and the batch is still running. The error names every entry to fix.', 5: 'The plan is not in progress; nothing was recorded.' },
    notes: ['ok with a valid read-back is done. failed goes back to pending while an attempt is left, then fails and skips everything downstream.',
      'not_started, auth_expired and needs_confirmation go back to pending and give the attempt back. A third hand-back of a task counts as a failed attempt.',
      'declined means the person said no to the task. It is skipped, and so is every task that waits on it, as with a declined optional action.',
      'waiting means the task started a long platform run. It goes back to pending with its attempt given back, and plan ready holds it until checkAfter minutes have passed; its error goes into the next message as Last attempt. A 13th wait counts as a failed attempt.',
      'A report with no tasks list ({}) means the builder stopped early. Its own report file is recorded when it wrote one, and every task that file does not settle is handed back with its attempt given back, since earlier writes may have landed. With --usage-limit that hand-back is not counted: only a stop for another reason counts toward the third hand-back that fails a task.',
      'The builder\'s own report file (the one its message names) is checked whole before anything is saved. A task missing from it, an unknown status, or an ok entry with no read-back line or a wrong ids.entity refuses the whole report with exit 1 and every reason: nothing is recorded, no attempt is spent, and the batch keeps running so the builder can fix the file and run the same command again.',
      'A report the router records instead (the json block of a reply) cannot be fixed by the builder, so each such entry counts as a failed attempt there, and so does a task missing from it.',
      'An entry for a task not in the batch is refused, and refused says why, with the task\'s last move.',
      'Each task keeps its last 4 moves in moves: the time, the status it moved to, and the command that moved it, so a task set back while its agent still worked shows who did it.',
      'An ok entry whose read-back names neither its entity nor one of its ids gets the entity name (and ids.entity) put in front of every line.',
      'ids.entity is one id. An ok entry that joins several ids there is refused, and the error says to put the other ids under their own keys.',
      'ids.entity is the task\'s own entity. When the plan already holds that entity\'s id (the task\'s planned id, or the id a done task reported for it), another id there is refused and the error names the id to use. A new object task that reports change created keeps the id it reports. A record task\'s entity is its object: the object id goes in ids.entity and the row ids in ids.records.',
      'Two tasks of one batch may report the same ids.entity only when they name the same entity: the same kind, and the same name or the same entity id.',
      'The message starts with Recorded: and says what happened to each task. planChanges lists every plan_change: note.'],
  },
  'plan confirm': {
    summary: 'Save the person\'s yes on pending deploy or publish tasks, or on tasks that delete, so plan ready can send them.',
    args: [{ name: '<planId>', description: 'The running plan.' }, { name: '<taskIds>', description: 'One task id, or a comma list such as t7,t8.' }],
    flags: {}, required: ['<planId>', '<taskIds>'],
    exitCodes: { 0: 'The yes was saved.', 5: 'The plan is not in progress; nothing was saved.' },
  },
  'plan reclaim': {
    summary: 'Take back tasks left running: back to pending, with the attempt given back.',
    args: [{ name: '<planId>', description: 'The running plan.' }],
    flags: { 'agent-name': 'Take back only the running tasks of this agent. Without it, every running task comes back.' },
    required: ['<planId>'],
    exitCodes: { 0: 'The tasks are pending again.', 5: 'The plan is not in progress.' },
    notes: ['Use it after claude --resume, when the agents that held those tasks can no longer report.',
      'Use --agent-name when that one agent could not be started or sent to.'],
  },
  'plan finish': {
    summary: 'Close a started plan: implemented by default, or at the user\'s request, or as a hard failure.',
    args: [{ name: '<planId>', description: 'The running plan.' }],
    flags: {
      'user-requested': 'Boolean. Close successfully at the user\'s request without changing tasks or running feature writes.',
      failed: 'Boolean. Close as a hard execution blocker. Needs --reason.',
      reason: 'The closing line. Required with --failed; optional with --user-requested.',
    },
    required: ['<planId>'],
    notes: ['--user-requested and --failed are mutually exclusive.', 'Without either flag the plan must have no pending or running tasks.',
      'notes holds every feedback: and feature: note the builders recorded, each once.'],
  },
  'plan get': { summary: 'Fetch one plan with its tasks, Markdown and status.', args: [{ name: '<planId>', description: 'Plan id.' }], flags: {}, required: ['<planId>'] },
  'plan list': {
    summary: 'List this solution\'s UnifyApps Headless plans, newest first.',
    flags: { status: 'Filter by planned, in_progress, implemented, failed or interrupted.' },
  },
  'skill sessions': {
    summary: 'Find Claude Code sessions on this laptop and write a digest of each for /ua:identify-loops: what the person typed, the tools and agents each turn used, the questions, errors and repeats. Returns each session\'s raw transcript path too. With no id, the current session. Writes nothing to the tenant.',
    args: [{ name: '[<session id | .jsonl path>...]', description: 'Up to 5 sessions, each a Claude session id or the path to its .jsonl transcript. None: the current session.' }],
    flags: {},
  },
  'skill publish': {
    summary: 'Publish a skill folder (SKILL.md and the text files beside it: references/, scripts/, assets/) to the tenant as one skill, read it back, and link it to this solution, so solution refresh puts it into .claude/skills/ for every folder on the solution. A skill already linked under the same name is refused unless --replace is given. Refuses a folder with a secret, a binary file, a symbolic link or a line that reads as a planted instruction.',
    args: [],
    flags: {
      folder: 'Path to the skill folder; its SKILL.md frontmatter gives the name and description.',
      'skill-id': 'Update this skill instead of the one linked under the folder\'s name.',
      replace: 'Boolean. Replace the skill already linked to this solution under the folder\'s name. Without it, that skill is refused with SKILL_EXISTS.',
    },
    required: ['--folder'],
  },
  'changeset confirm': {
    summary: 'Record the person\'s answer to the changeset question on the session, right after the AskUserQuestion and never without it. The tenant bridge lets the matching save_changeset, send_changeset or export_changeset through and refuses any other.',
    args: [],
    flags: {
      name: 'The exact name the next save_changeset will carry: a changeset not saved yet.',
      id: 'The changeset id: a draft that already exists (a resumed draft, a clone). Give --name or --id, not both.',
      answer: 'Send (a move to an environment) or Export (a file): the label the person chose.',
      'password-choice': 'typed or generated: the person\'s answer to the Password question. Required for a new export, refused for a move.',
    },
    required: ['--answer'],
  },
  'memory remember': {
    summary: 'Append one line to solution memory, which every session on this solution reads. Run it when the person asks to remember something, and at the end of a change for what its records do not already say.',
    args: [
      { name: '<section>', description: 'decisions, corrections, errors or notes.' },
      { name: '<text>', description: 'The line to remember, in the person\'s terms: the bare fact. The date and the label (the plan title, or "session") are added for you.' },
    ],
    flags: { plan: 'Plan id whose title labels the line instead of "session".' },
    required: ['<section>', '<text>'],
  },
  'memory get': { summary: 'Read solution memory, its line count and whether it is over the 500-line cap.', flags: {} },
  'memory consolidate': {
    summary: 'Replace solution memory wholesale with a rewritten set of sections.',
    flags: { file: 'Path to the consolidated memory JSON.' },
    required: ['--file'],
    input: {
      flag: 'file', format: 'json', description: 'A JSON object with all four sections. Each is an array of strings and may be empty; a missing section is rejected.',
      fields: {
        decisions: 'string[], required — settled decisions worth keeping.',
        corrections: 'string[], required — corrections the person made.',
        errors: 'string[], required — errors worth not repeating.',
        notes: 'string[], required — anything else.',
      },
      example: { decisions: ['2026-09-23 — session — Tasks are owned by one team.'], corrections: [], errors: [], notes: [] },
    },
  },
  'feature upsert': {
    summary: 'Create or update one feature document of this solution, matched by slug.',
    flags: { file: 'Path to the feature JSON.' },
    required: ['--file'],
    input: {
      flag: 'file', format: 'json', description: 'A JSON object describing one feature. Existing entities and planIds are merged, never dropped.',
      fields: {
        name: 'string, required — the feature name.',
        summary: 'string, required — one line about what it does.',
        slug: 'string, optional — defaults to the slug of name; it is what an upsert matches on.',
        entities: 'EntityRef[], required — the entities this feature covers, each { kind, name }. May be empty.',
        planIds: 'string[], required — the plans that built it. May be empty.',
        body: 'string, required — the feature document Markdown body.',
      },
      example: {
        name: 'Task list', summary: 'People create tasks and see their list.', slug: 'task-list',
        entities: [{ kind: 'object', name: 'Task' }, { kind: 'page', name: 'Homepage' }],
        planIds: ['e_plan_123'],
        body: '## What it does\nPeople create a task and see it in the list.\n\n## How it works\nHomepage lists Task records and Save task writes them.',
      },
    },
  },
  'feature list': { summary: 'List the feature documents of this solution.', flags: {} },
  'feature get': { summary: 'Read one feature document by slug.', args: [{ name: '<slug>', description: 'Feature slug.' }], flags: {}, required: ['<slug>'] },
  'feature match': {
    summary: 'Find the feature documents that cover given entities, and mark the ones a later plan made stale.',
    flags: { entities: 'A JSON EntityRef array, inline or a path to a JSON file.' },
    required: ['--entities'],
    input: {
      flag: 'entities', format: 'json', description: 'A JSON array of EntityRefs, passed inline or as a file path.',
      fields: ENTITY_REF, example: [{ kind: 'object', name: 'Task' }],
    },
  },
  'prd list': { summary: 'List the PRDs of this solution, one line per app: the current approved version, the open draft, and any version that failed its check.', flags: {} },
  'prd get': {
    summary: 'Read an app\'s PRD: the newest approved version that passes its check, or the version --version names. Says which versions failed their check and which draft is open.',
    args: [APP_ARG],
    flags: { version: 'A version number. Left out, the newest approved version that passes its check.', part: 'prd, plan or tickets, to read only that part. Left out, all three.' },
    required: ['<app>'],
  },
  'prd history': { summary: 'List every version of an app\'s PRD: status, who saved and approved it, what it was based on or restored from, and whether it passes its check.', args: [APP_ARG], flags: {}, required: ['<app>'] },
  'prd diff': {
    summary: 'Show the lines that differ between two versions of an app\'s PRD.',
    args: [APP_ARG, { name: '<from>', description: 'The earlier version number.' }, { name: '<to>', description: 'The later version number.' }],
    flags: { part: 'prd, plan or tickets, to compare only that part. Left out, the PRD and the plan.' },
    required: ['<app>', '<from>', '<to>'],
  },
  'prd check': {
    summary: 'Check a PRD Markdown file without writing anything: every section answered the way a spec\'s requirements checklist is, the J, R, S and Q ids holding together, and no gap left.',
    flags: { file: 'Path to the PRD Markdown.' },
    required: ['--file'],
    input: { flag: 'file', format: 'markdown', description: PRD_MD_NOTE },
    exitCodes: { 0: 'The PRD is ready to approve.', 1: 'The PRD is missing something; every issue is listed.' },
  },
  'prd classify': {
    summary: 'Say how much a PRD file changes the app\'s approved PRD, with nothing written: none, minor (an acceptance line added or reworded under a requirement that stays, a screen added or reworded, data fields added, an open question answered, the app plan updated) or major (a requirement or journey added or removed, a priority changed, an acceptance line or screen removed, data taken away, or any change to the outcome, roles, scope, rules, integrations, failures, quality or rollout). Each change is listed with its level.',
    args: [APP_ARG],
    flags: { file: 'Path to the PRD Markdown.', base: 'The version to compare with. Left out, the newest approved version.' },
    required: ['<app>', '--file'],
    input: { flag: 'file', format: 'markdown', description: PRD_MD_NOTE },
  },
  'prd save': {
    summary: 'Save an app\'s PRD as its open draft: the first save makes a new version on top of the newest approved one; a later save writes over the open draft. The tickets part of the file is ignored.',
    args: [APP_ARG],
    flags: {
      file: 'Path to the PRD Markdown. Its frontmatter may give title (required on the first PRD of an app), appId and tracker.',
      base: 'The approved version the change was written on, or new for an app\'s first PRD. Refused with PRD_BASE_MOVED when a newer version was approved since.',
      note: 'One line on what this version changes.',
      'record-version': 'The record version prd get or prd save last answered for the open draft. Required to save over a draft; refused with VERSION_CONFLICT when someone saved it since.',
    },
    required: ['<app>', '--file', '--base'],
    input: { flag: 'file', format: 'markdown', description: PRD_MD_NOTE },
  },
  'prd approve': {
    summary: 'Approve an app\'s open draft once the person said yes: it becomes the current version, sealed with a sha of its PRD and plan and the sha of the version before it. Never written again, except to record its tickets once.',
    args: [APP_ARG],
    flags: {
      version: 'The draft\'s version number.',
      'record-version': 'The record version of the draft the person reviewed. Refused with VERSION_CONFLICT when the draft changed since.',
      'app-id': 'The app\'s id, when it already exists.',
      minor: 'Boolean. Approve a minor update without the person\'s question, after a build. Refused with PRD_MAJOR_CHANGE when prd classify calls the draft a major change against the version it was written on, and for an app\'s first PRD.',
    },
    required: ['<app>', '--version', '--record-version'],
  },
  'prd tickets': {
    summary: 'Record the filed tickets on an approved version, once. A new version carries the tickets of the one before, which this replaces, or adds to with --add. Refused with PRD_APPROVED_LOCKED when the version\'s own tickets are already recorded, and with PRD_TAMPERED when the version failed its check.',
    args: [APP_ARG],
    flags: { version: 'The approved version the tickets were filed from.', file: 'Path to the tickets JSON.', 'app-id': 'The app\'s id, when the version does not name it yet.',
      add: 'Boolean. Keep the tickets the version already carries and add these; a row for a slice already there replaces it.' },
    required: ['<app>', '--version', '--file'],
    input: {
      flag: 'file', format: 'json', description: 'The filed tickets, as { "tickets": [...], "tracker": {...} } or as the tickets array alone.',
      fields: {
        tickets: 'object[], required — one per slice, in filing order: slice (T0, T1…), title, key (the filed ticket\'s key), url, depends (slice ids) and requirements (R ids). Every field given is kept, below the table, for the next version to compare with.',
        tracker: 'object, optional — where the tickets were filed (team, project, assignee), kept for the next version.',
      },
      example: { tracker: { team: 'HR Apps', project: 'Leave Management' }, tickets: [
        { slice: 'T0', title: 'Foundation: data model, roles, app shell', key: 'ABC-101', url: 'https://tracker.example.com/issue/ABC-101', depends: [], requirements: ['R1'] },
        { slice: 'T1', title: 'Leave request: apply and my requests', key: 'ABC-102', depends: ['T0'], requirements: ['R1', 'R2'] }] },
    },
  },
  'prd restore': {
    summary: 'Make a new draft holding an approved version, to undo a change: history is never rewritten. A version that failed its check comes back from this folder\'s backup copy when it holds a good one.',
    args: [APP_ARG],
    flags: { version: 'The approved version to bring back.', note: 'One line on why.' },
    required: ['<app>', '--version'],
  },
  'prd discard': {
    summary: 'Close an open draft without approving it, once the person said so. The record stays, marked discarded.',
    args: [APP_ARG],
    flags: { version: 'The draft\'s version number.', 'record-version': 'The record version of the draft that was read.' },
    required: ['<app>', '--version', '--record-version'],
  },
  'prd verify': {
    summary: 'Pull the PRDs again and check every approved version against its sha, the sha the next version recorded for it, and the sha this folder\'s backup holds. Names each version changed outside UnifyApps Headless and the restore that fixes it. An older version that failed is reported once a newer approved version passes.',
    args: [{ name: '[app]', description: 'One app. Left out, every app.' }],
    flags: {},
    exitCodes: { 0: 'The newest approved version of every PRD passes its check; any older one that failed is listed under earlier.', 1: 'PRD_TAMPERED: the newest approved version of a PRD was changed after its approval.' },
  },
  'session save': {
    summary: 'Save this UnifyApps Headless session with a transcript, or save a compact remarks-only report. Run by /ua:give-feedback, when the person asks.',
    flags: {
      type: 'Session type: Bug, Feature Request, or the person\'s own words.',
      family: `The surface the issue belongs to, one of: ${FAMILY_NAMES.join(', ')}.`,
      'suggested-family': `A short name for the family this issue should have had. Only with --family ${MISC_FAMILY}, and required there.`,
      'plan-id': 'The plan the issue came from, when it came from one.',
      remarks: 'The issue context: what happened, how to reproduce it, where it showed. Never a cause or a fix. First 200 lines are kept.',
      'remarks-file': 'Path to a Markdown file holding the remarks instead.',
      'remarks-only': 'Boolean. Save remarks without reading or uploading the transcript.',
    },
    required: ['--type', '--family'],
    notes: ['One record is one issue: save several records rather than listing several issues in one.',
      `--family ${MISC_FAMILY} needs --suggested-family; every other family refuses it.`,
      'resolutionStatus is written once as "reported"; the daily fixer owns every later value.',
      'A failed upload keeps the archive under .sessions/<sessionId>/ and still saves the record.', '--remarks-only requires non-empty remarks and stores no session file; its transcript statistics are the tenant and the signed-in person alone.'],
  },
};

const placeholder = (description) => (/^Path to\b/u.test(String(description ?? '')) ? '<path>' : '<value>');
const flagToken = (name, description) => (BOOLEAN.has(name) ? `--${name}` : `--${name} ${placeholder(description)}`);
const isRequired = (entry, token) => (entry.required ?? []).some((item) => item === token || item.startsWith(`${token} `));

function usageLine(key, entry) {
  const args = (entry.args ?? []).map((arg) => (isRequired(entry, arg.name) ? arg.name : `[${arg.name}]`));
  const flags = FLAGS[key].map((name) => {
    const token = flagToken(name, entry.flags[name]);
    return isRequired(entry, `--${name}`) ? token : `[${token}]`;
  });
  return ['ua', key, ...args, ...flags, '[--json]', '[--session <id>]'].join(' ');
}

function schemaFor(key, entry) {
  return {
    command: key,
    summary: entry.summary,
    usage: usageLine(key, entry),
    arguments: entry.args ?? [],
    flags: FLAGS[key].map((name) => ({
      name, type: BOOLEAN.has(name) ? 'boolean' : 'value',
      required: isRequired(entry, `--${name}`), description: entry.flags[name],
    })),
    globalFlags: Object.entries(GLOBAL_FLAGS).map(([name, description]) => ({ name, type: 'boolean', required: false, description })),
    ...(entry.input ? { input: entry.input } : {}),
    ...(entry.exitCodes ? { exitCodes: entry.exitCodes } : {}),
    ...(entry.notes ? { notes: entry.notes } : {}),
  };
}

const wrap = (text, indent) => {
  const width = 96 - indent.length;
  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/u).filter(Boolean)) {
    if (line && line.length + word.length + 1 > width) { lines.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.map((item, index) => (index === 0 ? item : indent + item)).join('\n');
};

function describeList(rows, lead = '  ') {
  const width = Math.max(...rows.map(([label]) => label.length));
  return rows.map(([label, text]) => {
    const pad = `${lead}${label.padEnd(width)}  `;
    return pad + wrap(text, ' '.repeat(pad.length));
  });
}

function renderCommand(schema) {
  const out = [`${schema.command} — ${schema.summary}`, '', 'Usage', `  ${schema.usage}`];
  if (schema.arguments.length) {
    out.push('', 'Arguments', ...describeList(schema.arguments.map((arg) => [arg.name, arg.description])));
  }
  if (schema.flags.length) {
    out.push('', 'Flags', ...describeList(schema.flags.map((flag) => [
      flagToken(flag.name, flag.description),
      `${flag.required ? '(required) ' : ''}${flag.description}`,
    ])));
  }
  if (schema.input) {
    const input = schema.input;
    out.push('', `--${input.flag} (${input.format})`, `  ${wrap(input.description, '  ')}`);
    if (input.fields) out.push('', '  Fields', ...describeList(Object.entries(input.fields), '    '));
    if (input.example !== undefined) {
      out.push('', '  Example', ...JSON.stringify(input.example, null, 2).split('\n').map((line) => `    ${line}`));
    }
  }
  if (schema.exitCodes) {
    out.push('', 'Exit codes', ...describeList(Object.entries(schema.exitCodes).map(([code, text]) => [code, text])));
  }
  if (schema.notes) out.push('', 'Notes', ...schema.notes.map((note) => `  - ${wrap(note, '    ')}`));
  out.push('', 'Global flags', ...describeList(schema.globalFlags.map((flag) => [`--${flag.name}`, flag.description])));
  return out.join('\n');
}

function renderIndex(area) {
  const areas = area ? { [area]: COMMANDS[area] } : COMMANDS;
  const out = ['Use `ua <area> <command> [arguments] [--json]`.', '',
    'Run `ua <area> <command> --help` for a command\'s flags and its JSON payload schema.', ''];
  for (const [name, commands] of Object.entries(areas)) {
    out.push(name, ...describeList(commands.map((command) => {
      const key = `${name} ${command}`;
      return [command, HELP[key] ? HELP[key].summary : ''];
    })), '');
  }
  return out.join('\n').trimEnd();
}

/** Help for one command, one area, or the whole CLI. Never touches the platform. */
export function helpFor(area, command) {
  const key = `${area} ${command}`;
  if (HELP[key] && COMMANDS[area]?.includes(command)) {
    const schema = schemaFor(key, HELP[key]);
    return { data: schema, text: renderCommand(schema), message: `${key}: ${schema.summary}`, exitCode: 0 };
  }
  const known = COMMANDS[area] ? area : null;
  const data = { commands: known ? { [known]: COMMANDS[known] } : COMMANDS, help: 'ua <area> <command> --help' };
  return { data, text: renderIndex(known), message: 'Use `ua <area> <command> [arguments] [--json]`.', exitCode: 0 };
}

export { HELP as COMMAND_HELP };
