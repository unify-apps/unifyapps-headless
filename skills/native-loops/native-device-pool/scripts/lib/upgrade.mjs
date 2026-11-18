// Brings one pool simulator to what this version wants: its ua-sim-NN name (names.mjs), and slim,
// or stock when config pool.slim is false (slim.mjs). A pool made by an earlier version gets both
// this way, one simulator at a time, without anyone running a command for it.
//
// Both changes need the simulator shut down: launchd_sim rewrites the slim store while it runs, and
// a running app keeps reporting its old device name. So a shut-down simulator is changed
// in place and stays shut down, and a booted one is shut down, changed and booted again. Callers
// only pass a simulator no other session is driving: `pool init` skips a reserved one, and
// `reserve` calls this for the simulator it has just reserved.
import * as simctl from './simctl.mjs';
import { poolName } from './names.mjs';
import { setSlim, slimState, verifySlim } from './slim.mjs';

/** What has to change: the name it should get (or null), and whether the slim list must be written. */
export function pending({ udid, index }, { slim, name }) {
  const wanted = poolName(index);
  let store;
  try {
    store = slimState(udid).state;
  } catch {
    store = 'unknown';
  }
  return { name: name === wanted ? null : wanted, slim: slim ? store !== 'slim' : store !== 'stock' };
}

/**
 * `sim` is simctl's row for the simulator ({ state, name }). Returns { changed, restarted, name, slim }:
 * `name` is the simulator's name afterwards, `slim` launchd's answer when it was booted again (with
 * `error` when the store could not be written; the simulator then keeps working as it was).
 * A simulator that is booting or shutting down is left alone.
 */
export function bringUpToDate(device, { slim, sim }) {
  const todo = pending(device, { slim, name: sim?.name });
  const unchanged = { changed: false, restarted: false, name: sim?.name ?? null, slim: null };
  if (!todo.name && !todo.slim) return unchanged;
  if (sim?.state !== 'Shutdown' && sim?.state !== 'Booted') return unchanged;
  const restarted = sim.state === 'Booted';
  if (restarted) simctl.shutdown(device.udid);
  let error = null;
  if (todo.slim) {
    try {
      setSlim(device.udid, { on: slim, state: 'Shutdown' });
    } catch (failure) {
      error = String(failure.message).slice(0, 300);
    }
  }
  if (todo.name) simctl.rename(device.udid, todo.name);
  let check = null;
  if (restarted) {
    simctl.boot(device.udid);
    check = slim ? verifySlim(device.udid) : null;
  }
  return {
    changed: true, restarted, name: todo.name ?? sim.name,
    slim: error ? { ...(check ?? { state: 'unknown' }), error } : check,
  };
}
