// Which pool simulator is the signed-in one (profile preferredDevice.udid), and the pool commands that
// copy its state to the others. Reads files only; never signs in and never stores a password.
import path from 'node:path';
import { readPool } from './probes.mjs';
import { readJson } from './paths.mjs';

const POOL = 'device-pool';

export function signedInPlan({ solution, home }) {
  const profile = readJson(path.join(solution, '.nebula', 'loops', 'profile.json'));
  const pool = readPool(home);
  if (!pool) return { ok: false, reason: 'no-pool', text: 'No simulator pool yet: loops pool up first.', data: { ok: false, reason: 'no-pool' } };
  const udid = profile?.preferredDevice?.udid ?? null;
  const preferred = udid ? pool.devices.find((device) => device.udid === udid) ?? null : null;
  const others = pool.devices.filter((device) => device.udid !== preferred?.udid);
  const count = Math.max(...pool.devices.map((device) => device.index ?? 0));
  const data = {
    ok: Boolean(preferred), reason: preferred ? null : udid ? 'preferred-not-in-pool' : 'none-recorded',
    preferred: preferred ? { name: preferred.name, udid: preferred.udid } : null,
    others: others.map((device) => ({ name: device.name, udid: device.udid })),
    commands: preferred ? [
      `${POOL} pool shutdown --udid ${preferred.udid}`,
      ...others.map((device) => `${POOL} pool remove --udid ${device.udid}`),
      `${POOL} pool init --count ${count} --clone-from ${preferred.udid}`,
      `${POOL} pool boot --udid ${preferred.udid}`,
    ] : [],
  };
  const text = preferred
    ? [`Signed-in simulator: ${preferred.name} (${preferred.udid}). Check it with describe; if it shows signed in, copy it to the ${others.length} other(s):`, ...data.commands.map((line) => `  ${line}`)].join('\n')
    : `No signed-in simulator recorded (${data.reason}). Ask the person to sign in on one pool simulator, then: profile.mjs set --dir <folder> preferredDevice.udid=<udid>`;
  return { ok: data.ok, data, text };
}
