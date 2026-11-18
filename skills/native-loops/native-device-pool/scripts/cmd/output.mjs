// Output and error conventions shared by every device-pool command.
export const EXIT = { OK: 0, ERROR: 1, USAGE: 2, BUSY: 3, REFUSED: 4 };

export class CommandError extends Error {
  constructor(exitCode, message, payload = null) {
    super(message);
    this.exitCode = exitCode;
    this.payload = payload;
  }
}

export const usage = (message) => new CommandError(EXIT.USAGE, message);
export const busy = (message, payload) => new CommandError(EXIT.BUSY, message, payload);
export const refused = (message, payload) => new CommandError(EXIT.REFUSED, message, payload);

export const shortId = (id) => String(id ?? '').slice(0, 8);

export function hhmm(iso) {
  if (!iso) return '-';
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function ago(iso, now = Date.now()) {
  if (!iso) return '-';
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 90) return `${seconds}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

export function table(rows, columns) {
  const cells = rows.map((row, index) => columns.map((column) => String((column.get ? column.get(row, index) : row[column.key]) ?? '')));
  const widths = columns.map((column, index) => Math.max(column.label.length, ...cells.map((row) => row[index].length)));
  const line = (values) => values.map((value, index) => value.padEnd(widths[index])).join('  ').trimEnd();
  return [line(columns.map((column) => column.label)), ...cells.map(line)].join('\n');
}

export function section(title, body) {
  return `${title}\n${body || '  (none)'}`;
}

export function emit(result, { json, render }) {
  if (json || !render) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${render(result)}\n`);
}
