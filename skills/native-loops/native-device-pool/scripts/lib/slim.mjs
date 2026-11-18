// Slim pool simulators: the background services in slim-services.mjs stay off, so each simulator
// with the Preview app takes about 1.4 GB instead of 3.4–5.2 GB and a laptop holds about twice
// as many (loop-orchestrator's capacity.mjs sizes the pool for it).
//
// The list goes into the store launchd_sim reads at start (sim-store.mjs) while the simulator is
// shut down, so it boots slim with no launchctl call and no extra reboot. The store keeps it across
// reboots on iOS 18.5 and newer; the pool runs 18.6. A clone or a new simulator starts without it,
// so `pool init` writes it into each one before its first boot. The store is not a documented
// interface, so after a boot `verifySlim` reads launchd's live state back and says what is still on.
//
// config.pool.slim false keeps simulators stock: the next `pool boot` turns the services back on.
import * as simctl from './simctl.mjs';
import { readStore, writeStore } from './sim-store.mjs';
import { SLIM_SERVICES } from './slim-services.mjs';

export { SLIM_SERVICES };

export const slimEnabled = (config) => config?.pool?.slim !== false;

const stateOf = (off) => (off === SLIM_SERVICES.length ? 'slim' : off === 0 ? 'stock' : 'partial');

/** What the store says the next boot will be, without booting: slim, stock or partial. */
export function slimState(udid) {
  const store = readStore(udid);
  const off = SLIM_SERVICES.filter((label) => store.get(label) === true).length;
  return { state: stateOf(off), off, of: SLIM_SERVICES.length };
}

/**
 * Writes the list for a simulator that is shut down: every service off, or (on: false) back on.
 * A booted simulator is refused, because launchd_sim would overwrite the store on its next change.
 * Returns how many services changed.
 */
export function setSlim(udid, { on = true, state = null } = {}) {
  const current = state ?? simctl.deviceState(udid);
  if (current !== 'Shutdown') throw new Error(`${udid} is ${current ?? 'missing'}; a simulator is slimmed only while it is shut down`);
  if (on) return writeStore(udid, Object.fromEntries(SLIM_SERVICES.map((label) => [label, true])));
  const store = readStore(udid);
  return writeStore(udid, Object.fromEntries(SLIM_SERVICES.filter((label) => store.get(label) === true).map((label) => [label, false])));
}

/**
 * After a boot: which of the services launchd really keeps off. `missing` counts the ones still on;
 * a runtime that ignored the store shows them all. Never throws: an unreadable device is `unknown`.
 */
export function verifySlim(udid) {
  const checkedAt = new Date().toISOString();
  try {
    const live = simctl.printDisabled(udid);
    const missing = SLIM_SERVICES.filter((label) => !live.has(label)).length;
    return { state: stateOf(SLIM_SERVICES.length - missing), missing, checkedAt };
  } catch (error) {
    return { state: 'unknown', error: String(error.message).slice(0, 300), checkedAt };
  }
}
