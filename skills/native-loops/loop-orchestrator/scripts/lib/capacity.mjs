// How many simulators and agents this laptop runs at once.
//
//   pool   = min(floor((RAM_GB - 10) / GB), floor(perfCores / CORES), MAX), at least 1
//            10 GB for macOS, Xcode and Claude. GB, CORES and MAX per simulator kind (SIZING):
//            slim (the default; native-device-pool's pool.slim): 2 GB, 1 core, at most 12
//            stock (pool.slim false):                          4.5 GB, 2 cores, at most 10
//   agents = 10 + 2 × (pool - 3), kept within 10..20
//            (slim: 24 GB with 8 performance cores → pool 7, 18 agents; 36 GB with 10 → pool 10,
//            20 agents; stock: 24 GB → pool 3, 10 agents; 36 GB → pool 5, 14 agents)
//
// Measured with the Preview app on iOS 18.6, an agent driving each simulator (describe, screenshot,
// a cold start of the app every third step, 5 s between steps): a slim simulator settles at 1.4 GB
// and uses 0.35 cores, 1.7 at a cold start; a stock one takes 3.4 GB once settled and 5.2 GB in its
// first hours, and 0.8 cores. Twelve slim simulators answered faster than six stock ones. The slim
// 2 GB leaves room for pages heavier than the sign-in screen the measurement showed.
//
// RAM from `sysctl -n hw.memsize`; performance cores from `sysctl -n hw.perflevel0.physicalcpu`,
// else `hw.physicalcpu` (Intel has no perf levels). LOOPS_HOME/config.json overrides either:
//   { "capacity": { "pool": 4, "agents": 12 } }   (pool.size, the device-pool key, also counts for the pool)
// native-device-pool's `pool init` imports poolSize() for its default --count.
import { run } from './exec.mjs';
import { loopsHomePath, readLoopsConfig } from './paths.mjs';

export const SIZING = Object.freeze({
  slim: Object.freeze({ gbPerSimulator: 2, coresPerSimulator: 1, max: 12 }),
  stock: Object.freeze({ gbPerSimulator: 4.5, coresPerSimulator: 2, max: 10 }),
});
export const AGENTS_MIN = 10;
export const AGENTS_MAX = 20;
const FALLBACK = { pool: 2, agents: AGENTS_MIN };

/** Pure: the suggestion for a machine, for slim simulators unless `slim` is false. */
export function suggest({ ramGb, perfCores, slim = true }) {
  if (!Number.isFinite(ramGb) || !Number.isFinite(perfCores) || ramGb <= 0 || perfCores <= 0) return { ...FALLBACK };
  const sizing = slim ? SIZING.slim : SIZING.stock;
  const byRam = Math.floor((ramGb - 10) / sizing.gbPerSimulator);
  const byCores = Math.floor(perfCores / sizing.coresPerSimulator);
  const pool = Math.max(1, Math.min(byRam, byCores, sizing.max));
  const agents = Math.max(AGENTS_MIN, Math.min(AGENTS_MAX, AGENTS_MIN + 2 * (pool - 3)));
  return { pool, agents };
}

const toNumber = (text) => {
  const value = Number(String(text ?? '').trim().split('\n')[0]);
  return Number.isFinite(value) && value > 0 ? value : null;
};

/** RAM and performance cores from sysctl: { ramGb, perfCores, source }. */
export function readMachine() {
  const memory = toNumber(run('sysctl', ['-n', 'hw.memsize'], { timeout: 3000 }).stdout);
  let cores = toNumber(run('sysctl', ['-n', 'hw.perflevel0.physicalcpu'], { timeout: 3000 }).stdout);
  let coreSource = 'hw.perflevel0.physicalcpu';
  if (!cores) {
    cores = toNumber(run('sysctl', ['-n', 'hw.physicalcpu'], { timeout: 3000 }).stdout);
    coreSource = 'hw.physicalcpu';
  }
  return {
    ramGb: memory ? Math.round((memory / 2 ** 30) * 10) / 10 : null,
    perfCores: cores,
    source: memory && cores ? `sysctl hw.memsize, ${coreSource}` : 'unknown (sysctl gave no answer)',
  };
}

const positive = (value) => (Number.isInteger(value) && value > 0 ? value : null);

/** The machine, the suggestion, and what the config overrides. */
export function capacity({ config, machine } = {}) {
  const settings = config ?? readLoopsConfig(loopsHomePath());
  const hw = machine ?? readMachine();
  const slim = settings?.pool?.slim !== false;
  const suggested = suggest({ ramGb: hw.ramGb, perfCores: hw.perfCores, slim });
  const poolOverride = positive(settings?.capacity?.pool) ?? positive(settings?.pool?.size);
  const agentsOverride = positive(settings?.capacity?.agents);
  return {
    machine: hw,
    slim,
    suggested,
    pool: Math.min(poolOverride ?? suggested.pool, 50),
    agents: Math.min(agentsOverride ?? suggested.agents, 50),
    overridden: { pool: poolOverride != null, agents: agentsOverride != null },
  };
}

/** The pool size to create (imported by native-device-pool's `pool init`). */
export function poolSize() {
  return capacity().pool;
}
