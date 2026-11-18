export const meta = {
  name: 'setup-toolchain',
  description: 'Probe every tool the loops need on this laptop, one agent per check, and list the fixes to approve. Installs nothing.',
  whenToUse: 'The doctor step of native-setup, and again after the approved installs ran (afterInstalls: true).',
  phases: [
    { title: 'Check', detail: 'one `loops doctor --only <check>` probe per tool, in parallel; the Figma row through whoami' },
    { title: 'Consolidate', detail: 'one table; the installs the person has to approve' },
  ],
}

// args: {cwd, pluginRoot, afterInstalls}
// `pluginRoot` is the folder ${CLAUDE_PLUGIN_ROOT} names (a workflow script is not expanded).
// `afterInstalls` is only passed through so the run after the installs has different args: an identical
// script with identical args would be answered from the resume cache instead of probing again.
const { cwd, afterInstalls, pluginRoot } = args ?? {}
if (!pluginRoot) throw new Error('args.pluginRoot is required: the UnifyApps Headless plugin folder that holds skills/native-loops/loop-orchestrator')
if (!cwd) throw new Error('args.cwd is required: the solution folder the setup runs in')

const CHECKS = [
  'node', 'xcode', 'ios-runtime', 'rosetta', 'baguette', 'argent', 'argent-skills', 'argent-server', 'ports', 'file-table',
  'ffmpeg', 'tesseract', 'UnifyApps Headless', 'figma-mcp', 'preview-app', 'sim-pool', 'capacity', 'loops-home',
]
const INSTALL_KINDS = ['brew', 'npm', 'loops', 'long', 'system']
const loops = `node "${pluginRoot}/skills/native-loops/loop-orchestrator/scripts/loops.mjs"`

const ROW_SCHEMA = {
  type: 'object',
  properties: {
    tool: { type: 'string' },
    present: { type: ['boolean', 'null'] },
    ok: { type: ['boolean', 'null'] },
    version: { type: ['string', 'null'] },
    detail: { type: 'string' },
    fixCommand: { type: ['string', 'null'] },
    fixKind: { type: 'string', enum: ['none', 'brew', 'npm', 'manual', 'loops', 'long', 'system'] },
    optional: { type: 'boolean' },
  },
  required: ['tool', 'present', 'version', 'detail', 'fixCommand', 'fixKind', 'optional'],
}

const shellPrompt = (check) => [
  `Run exactly this command with the Bash tool, from the folder ${cwd}:`,
  '',
  `  cd "${cwd}" && ${loops} doctor --only ${check} --json`,
  '',
  `It prints one JSON object whose \`rows\` array holds the row for ${check}. Return that row as your`,
  'structured output, field for field, without changing, shortening or adding anything (a missing',
  'fixKind is "none"). Run no other command. Do not install, fix, update, start or stop anything: the',
  'person approves every fix later, from the table this run produces.',
].join('\n')

const figmaPrompt = [
  'Load the Figma MCP tool mcp__claude_ai_Figma__whoami through ToolSearch ("select:mcp__claude_ai_Figma__whoami")',
  'and call it once. Return this structured output:',
  '  tool: "figma-mcp"',
  '  present: true when it names a signed-in account; false when the tool is not available or answers with an',
  '           authentication error',
  '  ok: the same as present',
  '  version: null',
  '  detail: the seat type it returned and whether it is signed in (no tokens, no email), or the error in one line',
  '  fixCommand: "connect Figma in the Claude desktop app\'s connector settings" when present is false, else null',
  '  fixKind: "manual" when present is false, else "none"',
  '  optional: true',
  'Call nothing else.',
].join('\n')

phase('Check')
const rows = await parallel(CHECKS.map((check) => () =>
  agent(check === 'figma-mcp' ? figmaPrompt : shellPrompt(check), { schema: ROW_SCHEMA, label: check, phase: 'Check', effort: 'low' })))

// The barrier is the point: the table needs every row before the person sees one question.
phase('Consolidate')
const checks = rows.filter(Boolean)
const missing = CHECKS.filter((check) => !checks.some((row) => row.tool === check))
const installs = checks.filter((row) => row.fixCommand && INSTALL_KINDS.includes(row.fixKind) && row.ok !== true)
const manual = checks.filter((row) => row.fixCommand && row.fixKind === 'manual' && row.ok !== true)
log(`${checks.length}/${CHECKS.length} checks answered; ${installs.length} installs to approve; ${manual.length} manual steps${missing.length ? `; no answer from ${missing.join(', ')}` : ''}`)
return { checks, installs, manual, missing, afterInstalls: Boolean(afterInstalls) }
