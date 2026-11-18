export const meta = {
  name: 'data-layer-check',
  description: 'One workflow_test run per outcome for each callable a page uses, through ua:automation-agent; a verdict per outcome, read from the STOP node',
  whenToUse: 'The data pass of native-audit and of the quick audit in the fix loop (automations that write nothing), and the data step of build for new or changed callables.',
  phases: [
    { title: 'Run', detail: 'one automation-agent per automation, one payload per outcome' },
    { title: 'Check', detail: 'compare each STOP output with the expected keys and values' },
    { title: 'Summarise', detail: 'one table, one evidence row per run' },
  ],
}

// args: { tenant, env, solution: {id, name}, uaCli, session, workFolders: {<wfId>: path},
//         automations: [{ id, name, version, allowedEffects: [...],
//                         outcomes: [{ name, payload, expect: { status, keys?: [...], values?: {...} } }] }] }
// uaCli is the full command the briefs run: bash "<plugin>/scripts/run-node.sh" "<plugin>/scripts/ua.mjs".
// Builders have the tenant tools; this script only briefs them and judges their structured answers.
// Payloads hold test ids, never a person's details.

const RUN = {
  type: 'object',
  required: ['automation', 'runs'],
  properties: {
    automation: { type: 'object', required: ['id', 'name'], properties: { id: { type: 'string' }, name: { type: 'string' } } },
    runs: {
      type: 'array',
      items: {
        type: 'object',
        required: ['outcome', 'runId', 'status'],
        properties: {
          outcome: { type: 'string' },
          runId: { type: 'string' },
          status: { type: 'string', enum: ['COMPLETED', 'FAILED', 'RUNNING', 'UNVERIFIED'] },
          stopOutput: {},
          failedNode: { type: 'string' },
          error: { type: 'string' },
          effectsReadBack: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    needsConfirmation: { type: 'array', items: { type: 'string' } },
    feedback: { type: 'array', items: { type: 'string' } },
  },
}

const brief = (automation) => `Tenant: ${args.tenant} (environment ${args.env}). Solution: ${args.solution.name} (${args.solution.id}).
UnifyApps Headless CLI: ${args.uaCli}, with --session ${args.session} on every command.
Work folder: ${args.workFolders[automation.id]}. Write every file of your own there and nowhere else.
The person asked in chat: "check the data layer of the page".
Task: test runs only on automation ${automation.name} (${automation.id}). For each outcome below call trigger_workflow_run {workflowId, runType: "workflow_test", triggerInput: <payload>}; read the run's status; read the STOP node's output through inspect_workflow_run with the node ids (describe_callable_workflow shows inputs only); a run still running after the 90 s wait is read once more with inspect_workflow_run, else report it UNVERIFIED. Read each named effect on its own surface and quote the line in effectsReadBack. Never compile_and_save_workflow, never deploy_workflow. Allowed effects: ${automation.allowedEffects.join('; ') || 'none beyond the run itself'}; anything else is needsConfirmation.
Current state: read cache wf ${automation.id} --contract first.
Outcomes: ${JSON.stringify(automation.outcomes.map((outcome) => ({ name: outcome.name, payload: outcome.payload })))}
Built so far: none. Yes from the person: none.
Return the structured result only.`

phase('Run')
const results = await pipeline(
  args.automations,
  (automation) => agent(brief(automation), {
    label: `runs: ${automation.name}`,
    phase: 'Run',
    agentType: 'ua:automation-agent',
    schema: RUN,
  }),
  (report, automation) => {
    if (!report) return { automation: { id: automation.id, name: automation.name }, runs: [], error: 'no report' }
    report.runs = report.runs.map((run) => {
      const want = automation.outcomes.find((outcome) => outcome.name === run.outcome)?.expect || {}
      const keysOk = (want.keys || []).every((key) => run.stopOutput && key in run.stopOutput)
      const valuesOk = Object.entries(want.values || {}).every(([key, value]) => run.stopOutput?.[key] === value)
      const statusOk = !want.status || want.status === run.status
      const verdict = run.status === 'UNVERIFIED' ? 'unverified' : (statusOk && keysOk && valuesOk ? 'matches' : 'differs')
      return { ...run, verdict }
    })
    return report
  },
)

phase('Summarise')
const rows = results.filter(Boolean).flatMap((report) => (report.runs || []).map((run) => ({
  automation: report.automation.name,
  automationId: report.automation.id,
  outcome: run.outcome,
  runId: run.runId,
  status: run.status,
  verdict: run.verdict,
  error: run.error || '',
  effectsReadBack: run.effectsReadBack || [],
})))
const count = (verdict) => rows.filter((row) => row.verdict === verdict).length
log(`${rows.length} runs: ${count('matches')} match, ${count('differs')} differ, ${count('unverified')} unverified`)
const missing = results.filter((report) => report && report.error).map((report) => report.automation.name)
if (missing.length) log(`no report from: ${missing.join(', ')}`)
return {
  rows,
  needsConfirmation: results.flatMap((report) => report?.needsConfirmation || []),
  feedback: results.flatMap((report) => report?.feedback || []),
  missing,
}
