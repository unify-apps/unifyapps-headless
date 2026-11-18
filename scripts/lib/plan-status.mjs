/** Add a leading outcome without reserializing the plan, its metadata or tasks. */
const frontmatter = /^---\r?\n[\s\S]*?\r?\n---\r?\n/u;
const statusBlock = /^<!-- nebula:status -->\r?\n## Status\r?\n([^\r\n]*)\r?\n<!-- \/nebula:status -->\r?\n\r?\n/u;
const escapeText = (text) => text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
const unescapeText = (text) => text.replace(/&gt;/gu, ">").replace(/&lt;/gu, "<").replace(/&amp;/gu, "&");

export const statusLine = (text) => String(text ?? "").replace(/[\s\u0000-\u001f\u007f]+/gu, " ").trim();

function split(text) {
  const head = String(text).match(frontmatter)?.[0] ?? "";
  return { head, body: text.slice(head.length) };
}

export function readPlanStatus(text) {
  const match = split(text).body.match(statusBlock);
  return match ? unescapeText(match[1]) : null;
}

export function withPlanStatus(text, statusText) {
  const { head, body } = split(text);
  const newline = head.includes("\r\n") ? "\r\n" : "\n";
  const block = ["<!-- nebula:status -->", "## Status", escapeText(statusLine(statusText)), "<!-- /nebula:status -->", "", ""].join(newline);
  return head + block + body.replace(statusBlock, "");
}
