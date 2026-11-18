// Component configuration (COMP): keys a block needs to render or to do its job.
import { blockTarget, isBinding, isBlank, listOf, liveActions, walkedFacts } from './shared.mjs';

/**
 * A wrapper key stored as a bare truthy value. The platform reads it with
 * `'value' in editable`, which throws on a primitive; a bare false never gets that far.
 */
const bareTruthy = value => Boolean(value) && typeof value !== 'object' && !isBinding(value);

function bareFlagCheck(id, types, key, shape) {
  return {
    id,
    run: page => walkedFacts(page, ...types).filter(fact => bareTruthy(fact.content[key])).map(fact => ({
      target: blockTarget(page, fact.id),
      evidence: `content.${key} is ${JSON.stringify(fact.content[key])}, not ${shape}, so the ${fact.type} throws on render`,
    })),
  };
}

export const compChecks = [
  {
    id: 'give-commentinput-sendmessage-action-wired',
    run: page => walkedFacts(page, 'CommentInput').flatMap(fact => {
      const actions = fact.content.actions;
      if (isBinding(actions)) return [];
      // Only a STANDARD sendMessage action fires onAddComment, at its own id.
      const send = listOf(actions).find(action => action?.type === 'STANDARD' && action.action === 'sendMessage');
      const target = blockTarget(page, fact.id);
      if (!send) return [{ target, evidence: `content.actions holds no STANDARD sendMessage action (${JSON.stringify(actions ?? null).slice(0, 40)}), so the box has no way to send` }];
      const wired = liveActions(page).some(entry => entry.target.id === fact.id && entry.eventType === 'onAddComment' && entry.targetId === send.id);
      return wired ? [] : [{ target, evidence: `no live onAddComment event targets the sendMessage action "${send.id}", so sending saves nothing` }];
    }),
  },
  {
    id: 'set-comments-blocks-assetid-without',
    run: page => walkedFacts(page, 'Comments')
      // The Comments block draws the entity feed for every source but 'mapped'.
      .filter(fact => fact.content.source !== 'mapped' && isBlank(fact.content.assetId))
      .map(fact => ({ target: blockTarget(page, fact.id), evidence: `content.assetId is ${fact.content.assetId === undefined ? 'absent' : JSON.stringify(fact.content.assetId)}, so posting and replying do nothing` })),
  },
  {
    id: 'set-aiagentid-copilot-copilotvoice-without',
    run: page => walkedFacts(page, 'Copilot', 'CopilotVoice')
      // A Copilot reads aiAgentId on every variant but LIVE_CHAT; CopilotVoice always does.
      .filter(fact => isBlank(fact.content.aiAgentId) && !(fact.type === 'Copilot' && fact.content.variant === 'LIVE_CHAT'))
      .map(fact => ({ target: blockTarget(page, fact.id), evidence: `content.aiAgentId is ${fact.content.aiAgentId === undefined ? 'absent' : JSON.stringify(fact.content.aiAgentId)}, so the ${fact.type} renders nothing` })),
  },
  bareFlagCheck('write-links-openinnewtab-value-true', ['Link'], 'openInNewTab', '{ "value": true }'),
  bareFlagCheck('write-slider-axisiconpicker-editable-flags', ['Slider', 'AxisIconPicker'], 'editable', '{ "value": … }'),
  {
    id: 'keep-tables-columns-key-even',
    run: page => walkedFacts(page, 'Table')
      // The Table reads content.columns before any guard, so a missing key breaks it.
      .filter(fact => fact.content.columns === undefined || fact.content.columns === null)
      .map(fact => ({ target: blockTarget(page, fact.id), evidence: `content.columns is ${fact.content.columns === null ? 'null' : 'absent'}, so the Table throws on render; store [] for no columns` })),
  },
];
