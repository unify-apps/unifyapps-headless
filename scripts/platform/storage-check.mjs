/** Probe whether a tenant holds every lifecycle record type. No output, browser or cache side effects. */
import { LIFECYCLE_TYPES } from '../lib/contracts.mjs';

export const isLocalId = (id) => /^e_local[a-z0-9]+$/u.test(String(id ?? ''));

/** Any missing type sends the whole solution lifecycle to the workspace store; there is no mixed storage. */
export async function checkTenantStorage(service) {
  const missing = [];
  await Promise.all(LIFECYCLE_TYPES.map(async (type) => {
    try { await service.getVersioned('ENTITY_TYPE', type); }
    catch (error) {
      if (error?.code !== 'NOT_FOUND') throw error;
      missing.push(type);
    }
  }));
  const ordered = LIFECYCLE_TYPES.filter(type => missing.includes(type));
  return { storage: ordered.length ? 'local' : 'platform', missing: ordered, checked: [...LIFECYCLE_TYPES], checkedAt: new Date().toISOString() };
}
