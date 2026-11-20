// `workspace list` and `workspace show`: the tenant workspaces a person may open,
// and the one this folder's solution works in.
//
// A workspace is the platform's own grouping of apps, objects, automations and
// solutions (its screens call it a workspace; its API calls it a project). One
// folder works in exactly one of them, chosen at setup and never changed here.
import { GLOBAL_WORKSPACE_NAME, UaError } from '../lib/contracts.mjs';
import { listWorkspaces, workspaceOf } from '../platform/workspaces.mjs';
import { tenantForFolder } from '../folder/local.mjs';

function tenantFor(ctx, flags) {
  const named = flags.tenant ? String(flags.tenant) : null;
  const open = ctx.state?.tenant ?? null;
  const folder = (() => { try { return tenantForFolder(ctx.cwd)?.tenant ?? null; } catch { return null; } })();
  const tenant = named ?? open ?? folder;
  if (!tenant) throw new UaError('USAGE', 'Name the tenant with --tenant, or open a solution first.');
  if (named && open && named !== open) {
    throw new UaError('TENANT_MISMATCH', undefined, { urlHost: named, tenant: open, what: 'tenant' });
  }
  return tenant;
}

export async function run(command, args, flags, ctx = {}) {
  if (command === 'list') {
    const tenant = tenantFor(ctx, flags);
    const search = flags.search ? String(flags.search) : undefined;
    const { workspaces, listedAll } = await listWorkspaces(tenant, { search });
    return {
      data: {
        tenant,
        workspaces,
        listedAll,
        // Setup asks only when there is a real choice. One workspace beside
        // Global is that person's workspace, so it is the one to offer.
        only: workspaces.length === 2 ? workspaces.find((workspace) => !workspace.global) ?? null : null,
        note: listedAll
          ? `${GLOBAL_WORKSPACE_NAME} is not a stored workspace: it is everything that belongs to no workspace.`
          : 'More workspaces exist than could be listed. Search by name with --search.',
      },
      message: workspaces.map((workspace) => `${workspace.name} (${workspace.id})`).join('\n'),
    };
  }

  if (command === 'show') {
    const open = ctx.state;
    if (!open?.solutionId) throw new UaError('NO_SOLUTION');
    const workspace = workspaceOf(open);
    return {
      data: { tenant: open.tenant, solutionId: open.solutionId, workspace },
      message: `This solution works in ${workspace.name}${workspace.global ? '' : ` (${workspace.id})`}.`,
    };
  }

  throw new UaError('USAGE', `Unknown workspace command: ${command}`);
}
