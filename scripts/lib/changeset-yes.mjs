// The person's answer to the changeset question, recorded on the session state
// so the tenant bridge can check it before a save, send or export leaves.
//
// The changeset-manager skill asks one question (Send / Export) and, for an
// export, one more (I'll type it / Fill it for me). A skill that only *says*
// "never send without the yes" held two times out of three in the first live
// run: on the third request the session reviewed, saved and sent a changeset
// with no question at all. So the yes is a recorded step, the way `plan
// confirm` records a deploy's yes: `ua.mjs changeset confirm` writes it
// here, and `mcp-bridge.mjs` refuses `save_changeset`, `send_changeset` and
// `export_changeset` for a changeset with no matching record.
//
// A new changeset has no id until it is saved, so its answer is recorded by
// the exact `name` the save will carry; the bridge moves the record to the id
// the save answers. A draft that already exists (a resumed draft, a clone) is
// recorded by id. Pure: no files, no network.

export const ANSWERS = Object.freeze(['Send', 'Export']);
export const PASSWORD_CHOICES = Object.freeze(['typed', 'generated']);
export const GATED_TOOLS = Object.freeze(['save_changeset', 'send_changeset', 'export_changeset']);
const TYPE_OF = Object.freeze({ Send: 'MOVE', Export: 'EXPORT' });
const CONFIRM = 'node scripts/ua.mjs changeset confirm';

const records = (state) => ({
  byName: { ...(state?.changesetYes?.byName ?? {}) },
  byId: { ...(state?.changesetYes?.byId ?? {}) },
});
const cleanName = (name) => String(name ?? '').trim();

/** The state patch that records one answer, by name (a changeset not yet saved) or by id. */
export function withAnswer(state, { name, id, answer, passwordChoice, at = new Date().toISOString() }) {
  if (!ANSWERS.includes(answer)) throw new Error(`The answer must be one of ${ANSWERS.join(', ')}.`);
  if (passwordChoice !== undefined && !PASSWORD_CHOICES.includes(passwordChoice)) throw new Error(`The password choice must be one of ${PASSWORD_CHOICES.join(', ')}.`);
  const yes = records(state);
  const entry = { answer, ...(passwordChoice ? { passwordChoice } : {}), at };
  if (id) yes.byId[String(id)] = entry;
  else {
    const key = cleanName(name);
    if (!key) throw new Error('A name or an id is required.');
    yes.byName[key] = entry;
  }
  return { changesetYes: yes };
}

function passwordProblem(entry, args, label) {
  if (args.generatePassword && entry.passwordChoice !== 'generated') {
    return `Nothing was sent: generatePassword needs the person's "Fill it for me", recorded as --password-choice generated for ${label}; the record says ${entry.passwordChoice ?? 'no password choice'}. Ask the Password question, record the answer, then send the same call again.`;
  }
  if (args.password !== undefined && entry.passwordChoice !== 'typed') {
    return `Nothing was sent: a typed password needs the person's "I'll type it", recorded as --password-choice typed for ${label}; the record says ${entry.passwordChoice ?? 'no password choice'}. Ask the Password question, record the answer, then send the same call again.`;
  }
  return null;
}

/** Why the bridge must refuse this call, or null when the recorded answer covers it. */
export function gateProblem(state, tool, args = {}) {
  if (!GATED_TOOLS.includes(tool)) return null;
  const { byName, byId } = records(state);
  if (tool === 'save_changeset') {
    if (args.id !== undefined && args.id !== null && args.id !== '') {
      const id = String(args.id);
      const entry = byId[id];
      if (!entry) return `Nothing was sent: no recorded answer for changeset ${id}. Show the manifest, ask the person, then run \`${CONFIRM} --id ${id} --answer <Send|Export>\` and send the same call again.`;
      return passwordProblem(entry, args, id);
    }
    const name = cleanName(args.name);
    const entry = byName[name];
    if (!entry) return `Nothing was sent: no recorded answer for a changeset named ${JSON.stringify(name)}. Show the manifest, ask the person, then run \`${CONFIRM} --name ${JSON.stringify(name)} --answer <Send|Export> [--password-choice typed|generated]\` and send the same call again.`;
    const type = String(args.type ?? '').toUpperCase();
    if (TYPE_OF[entry.answer] !== type) return `Nothing was sent: the recorded answer for ${JSON.stringify(name)} is ${entry.answer}, which is for a ${TYPE_OF[entry.answer]} changeset, and this save is ${type ? `a ${type}` : 'a changeset with no type'}. Ask again and record the answer that matches.`;
    return passwordProblem(entry, args, JSON.stringify(name));
  }
  const want = tool === 'send_changeset' ? 'Send' : 'Export';
  const id = String(args.id ?? '');
  const entry = byId[id];
  if (!entry) return `Nothing was sent: no recorded answer for changeset ${id || '(no id)'}. Show the manifest, ask the person, then run \`${CONFIRM} --id ${id} --answer ${want}\` and send the same call again.`;
  if (entry.answer !== want) return `Nothing was sent: the recorded answer for changeset ${id} is ${entry.answer}, and this call needs ${want}. Ask again and record the answer that matches.`;
  return null;
}

/** After a create answered with an id: the record moves from the name to that id. */
export function afterSave(state, args = {}, replyText) {
  if (args.id !== undefined && args.id !== null && args.id !== '') return null;
  let id;
  try { id = JSON.parse(replyText ?? '')?.id; } catch { return null; }
  if (typeof id !== 'string' || !id) return null;
  const yes = records(state);
  const name = cleanName(args.name);
  const entry = yes.byName[name];
  if (!entry) return null;
  delete yes.byName[name];
  yes.byId[id] = entry;
  return { changesetYes: yes };
}

/** A draft reverted for new content needs a new answer: the old one goes. */
export function afterRevert(state, id) {
  const yes = records(state);
  if (!Object.hasOwn(yes.byId, String(id ?? ''))) return null;
  delete yes.byId[String(id)];
  return { changesetYes: yes };
}
