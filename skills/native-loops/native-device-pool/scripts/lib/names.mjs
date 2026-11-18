// Pool simulator names: ua-sim-01, ua-sim-02, … Two digits, so the list sorts in order, and a
// prefix that tells them apart from a person's own simulators. Earlier versions named them
// loops-1, loops-2, …: `pool init` adopts those by name, and each is renamed the next time it is
// shut down or restarted (upgrade.mjs).
export const poolName = (index) => `ua-sim-${String(index).padStart(2, '0')}`;
export const legacyName = (index) => `loops-${index}`;
