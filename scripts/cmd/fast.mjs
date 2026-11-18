// `fast brief` and `fast accept` are kept names for spec draft and spec accept:
// one format, one accept path. Only fast accept takes --execution.
import { UaError } from '../lib/contracts.mjs';
import { run as spec } from './spec.mjs';

export async function run(command, args = [], flags = {}, ctx = {}) {
  if (command === 'brief') return spec('draft', args, flags, ctx);
  if (command === 'accept') return spec('accept', args, flags, ctx);
  throw new UaError('USAGE', `Unknown fast command: ${command}.`);
}
