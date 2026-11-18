/** Identify visible Markdown without treating examples or comments as answers. */
export function markdownLines(text) {
  const source = String(text ?? '').replace(/\r\n?/gu, '\n')
    .replace(/<!--[\s\S]*?(?:-->|$)/gu, comment => comment.replace(/[^\n]/gu, ' '));
  let fence = null;
  return source.split('\n').map(line => {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      return { line, code: true };
    }
    if (marker) { fence = marker[1]; return { line, code: true }; }
    return { line, code: /^ {4}|^\t/u.test(line) };
  });
}

export function withoutCodeSpans(text) {
  // Only mask complete same-line spans. An odd backslash escapes the opener;
  // backslashes inside code cannot escape its closer. Multiline HTML uses fences.
  return String(text).replace(/(?<![\\`])((?:\\\\)*)(`+)(?!`)[^\n]*?(?<!`)\2(?!`)/gu, '$1 named value ');
}

export function specSections(text) {
  let title = '';
  let current;
  const sections = Object.create(null), duplicates = [], visible = [];
  for (const { line, code } of markdownLines(text)) {
    if (!code) {
      visible.push(line);
      const heading = /^ {0,3}##\s+(.+?)\s*$/u.exec(line);
      if (heading) {
        current = heading[1].replace(/\s*★\s*$/u, '').trim();
        if (Object.hasOwn(sections, current)) duplicates.push(current);
        else sections[current] = [];
        continue;
      }
      const first = /^ {0,3}#\s+(.+?)\s*$/u.exec(line);
      if (first && !title) title = first[1].trim();
    }
    if (current) sections[current].push(line);
  }
  // Also catches an unfilled `<placeholder>` from a template, since it has the
  // same shape as a real tag. The caller names the exact match in its message
  // so the person can tell "fill this in" from "this is actually HTML".
  const rawHtmlMatch = /<\/?[a-z][\w-]*(?=[\s/>])[^>]*>/iu.exec(withoutCodeSpans(visible.join('\n')));
  return { title, sections, duplicates, rawHtml: !!rawHtmlMatch, rawHtmlMatch: rawHtmlMatch?.[0] ?? null };
}

/** The body with `lines` added at the end of its `## <heading>` section, after
 * the section's last written line. A heading the body does not have is added at
 * the end. Code blocks are never read as headings. */
export function addSectionLines(text, heading, lines) {
  const source = String(text ?? '').replace(/\r\n?/gu, '\n');
  const rows = source.split('\n');
  const marked = markdownLines(source);
  const isHeading = (index, pattern) => !marked[index].code && pattern.test(rows[index]);
  const start = rows.findIndex((_, index) => isHeading(index, /^ {0,3}##\s+/u) &&
    rows[index].replace(/^ {0,3}##\s+/u, '').replace(/\s*★\s*$/u, '').trim() === heading);
  if (start < 0) return `${source.replace(/\n*$/u, '')}\n\n## ${heading}\n${lines.join('\n')}\n`;
  let end = rows.length;
  for (let index = start + 1; index < rows.length; index++) if (isHeading(index, /^ {0,3}#{1,2}\s+/u)) { end = index; break; }
  let last = end - 1;
  while (last > start && !rows[last].trim()) last -= 1;
  rows.splice(last + 1, 0, ...lines);
  return rows.join('\n');
}
