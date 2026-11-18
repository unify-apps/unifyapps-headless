import { UaError } from '../lib/contracts.mjs';
import { ANSWERS, PASSWORD_CHOICES, withAnswer } from '../lib/changeset-yes.mjs';
import { writeState } from '../workspace/local.mjs';

// `changeset confirm` records the person's answer to the changeset question on
// the session state, right after the AskUserQuestion and never without it. The
// tenant bridge then lets the matching `save_changeset`, `send_changeset` or
// `export_changeset` through and refuses any other (`lib/changeset-yes.mjs`).
// A new changeset is recorded by the exact name its save will carry; a draft
// that already exists (resumed, or a clone) by its id.
export async function run(command, args = [], flags = {}, ctx = {}) {
  if (command !== 'confirm') throw new UaError('USAGE', 'Use `ua changeset confirm`.');
  if (!ctx.state || !ctx.home) throw new UaError('NOT_STARTED');
  const answer = String(flags.answer ?? '').trim();
  if (!ANSWERS.includes(answer)) throw new UaError('USAGE', '--answer must be Send or Export: the label the person chose.');
  const name = typeof flags.name === 'string' ? flags.name.trim() : '';
  const id = typeof flags.id === 'string' ? flags.id.trim() : '';
  if (!name && !id) throw new UaError('USAGE', 'Give --name <the name the save will carry> for a new changeset, or --id <id> for a draft that already exists.');
  if (name && id) throw new UaError('USAGE', 'Give --name or --id, not both.');
  const passwordChoice = flags['password-choice'] === undefined ? undefined : String(flags['password-choice']).trim();
  if (passwordChoice !== undefined && !PASSWORD_CHOICES.includes(passwordChoice)) throw new UaError('USAGE', '--password-choice must be typed or generated: the answer to the Password question.');
  if (answer === 'Export' && name && !passwordChoice) throw new UaError('USAGE', 'A new export needs --password-choice typed|generated: ask the Password question first, then record the answer.');
  if (answer === 'Send' && passwordChoice) throw new UaError('USAGE', 'A move has no password, so --password-choice goes only with --answer Export.');
  const patch = withAnswer(ctx.state, { name: name || undefined, id: id || undefined, answer, passwordChoice });
  writeState(ctx.home, patch, ctx.sessionId);
  const label = name ? JSON.stringify(name) : id;
  return {
    data: { answer, ...(name ? { name } : { id }), ...(passwordChoice ? { passwordChoice } : {}) },
    message: `Recorded: ${answer}${passwordChoice ? `, password ${passwordChoice}` : ''} for ${label}. The matching save, send or export may go now.`,
  };
}
