export const meta = {
  name: 'design-board',
  description: 'Capture several Figma frames into the loops Figma cache and the solution design store through fresh-context ua:design-capture agents, one frame at a time when the seat is rate-limited',
  whenToUse: 'The design intake stage of /ua:native-build-loop, fix or audit, when the person gives more than one Figma frame.',
  phases: [
    { title: 'Capture', detail: 'one ua:design-capture agent per frame; the results never enter this session' },
    { title: 'Summarise', detail: 'paths, sizes and rate limits per frame' },
  ],
}

// args: { fileKey, nodes: [{ nodeId, page, want: ["screenshot","metadata","designContext"] }],
//         cacheDir, runDir, sequential: true, platform: "MOBILE" | "WEB" (default MOBILE) }
// cacheDir is LOOPS_HOME/figma-cache (the capture agent adds <fileKey>/<nodeId>/); runDir is the
// folder the board links into: the run folder, whose board native-design-spec copies into
// <solution>/design/<app-id>/. A View seat allows about one design-context call per agent, so frames
// run one at a time by default; the agent writes files and returns only paths.

const CAPTURE = {
  type: 'object',
  required: ['nodeId', 'paths'],
  properties: {
    nodeId: { type: 'string' },
    frameName: { type: 'string' },
    width: { type: 'number' },
    height: { type: 'number' },
    paths: { type: 'object' },
    sizes: { type: 'object' },
    rateLimited: { type: 'array', items: { type: 'string' } },
    oversized: { type: 'array', items: { type: 'string' } },
    error: { type: 'string' },
  },
}

const prompt = (node) => `Capture the Figma node ${node.nodeId} of file ${args.fileKey} into the design cache.
cacheDir: ${args.cacheDir}. runDir: ${args.runDir}. want: ${JSON.stringify(node.want || ['screenshot', 'metadata'])}. platform: ${args.platform === 'WEB' ? 'WEB' : 'MOBILE'}.
Follow your capture procedure exactly: check the cache first; screenshot first (maxDimension 4096, curl the URL to disk, write screenshot.json with pxPerPt from the PNG header); metadata on this frame node only; design context only when asked and no rate limit was recorded in the last 24 hours, after loading the figma-design-to-code guidance. On a rate limit, record it in meta.json and stop. Return only paths, sizes, rateLimited and oversized; never the content.`

const capture = (node) => agent(prompt(node), {
  label: `capture ${node.page || node.nodeId}`,
  phase: 'Capture',
  agentType: 'ua:design-capture',
  schema: CAPTURE,
})

phase('Capture')
const captures = []
if (args.sequential !== false) {
  for (const node of args.nodes) {
    const result = await capture(node)
    captures.push(result || { nodeId: node.nodeId, paths: {}, error: 'no result' })
    if (result?.rateLimited?.length) log(`rate limited on ${node.nodeId}: ${result.rateLimited.join(', ')}; later frames keep to screenshot and metadata`)
  }
} else {
  const results = await parallel(args.nodes.map((node) => () => capture(node)))
  captures.push(...results.map((result, index) => result || { nodeId: args.nodes[index].nodeId, paths: {}, error: 'no result' }))
}

phase('Summarise')
const rateLimited = captures.filter((item) => item.rateLimited?.length).map((item) => item.nodeId)
const oversized = captures.filter((item) => item.oversized?.length).map((item) => item.nodeId)
log(`${captures.length} frames: ${captures.filter((item) => !item.error).length} captured, ${rateLimited.length} rate-limited, ${oversized.length} oversized metadata`)
return { captures, rateLimited, oversized }
