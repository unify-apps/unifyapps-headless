# Agents the app calls

AI agents behind Copilot and chat blocks: the platform's agent checks and the review checklist.

33 rules: P0 0, P1 14, P2 14, P3 5.

## P1

- Turn on at least one guardrail: blocked messaging, denied topics, word filter, PII redaction or content filter.
- Give the agent a clear, unambiguous name, goals, role and instructions.
- Give every app an agent tool uses an active runtime connection.
- Mask PII when indexing knowledge and in agent queries.
- Move a task's only tool up to an agent-level tool.
- Give every agent task and tool a clear name and a description of when to use it.
- Expose complex operations to an agent through an automation, not as raw tools.
- Give an agent an automation tool instead of indexing an object past a few thousand records as knowledge.
- Attach every skill and tool the agent's instructions name, under the exact name the model sees.
- Resolve pairs of absolute rules (NEVER, ALWAYS, MUST) in agent instructions and skills that order different actions.
- Remove tool descriptions that tell the agent to invent data rather than ask or say not found.
- Remove tools the agent has no use for; an IngestKnowledge tool lets any user add files to the shared knowledge.
- Never rely on a tool description to hide data; restrict it in the tool or the connection's permissions.
- Keep personal names, emails, internal URLs and ticket ids out of agent prompts, and add a rule against revealing them.

## P2

- Give every model the agent and its indexing name an active connection; no default or half-set model fields.
- Attach only knowledge sources that finished processing and indexing.
- Turn on context compaction for the agent.
- Set the agent's response model, language, tone, style and format.
- Set guardrail values and thresholds that fit the agent's job.
- Run the Agent Optimizer on staging and clear its findings before an agent review.
- Budget agent tokens; trim the system prompt, knowledge and query tools when each takes about a third.
- Trim tool descriptions to what the agent needs; one was 34k tokens.
- Turn on prompt caching and parallel tool calls, and set reasoning effort on purpose.
- Check traces for an agent that ignores tool results or re-fetches knowledge in one turn.
- Prove every agent prompt or tool change with a before and after eval run.
- Never name a switched-off tool in the agent's instructions.
- Never ask an agent to do something it has no tool for, like fetching a website without web search.
- Describe every tool parameter and mark the required ones required.

## P3

- Set user-friendly blocked messages for both prompt and response guardrails.
- Remove default tools the agent cannot use, such as Generate Public Url or web search.
- Strip system and audit fields like sys_id and sys_created_by from indexed knowledge metadata.
- Cut repeated instructions, chit-chat examples and excess few-shots from agent prompts.
- Keep the agent's tool list the same across turns of one conversation so prompt caching holds.
