# Export and print

PDF export and print layouts that come out whole and on time.

9 rules: P0 0, P1 6, P2 1, P3 2.

## P1

- Point exportLayout header and footer at existing blocks; a missing id reflows the print with a blank band. (web only)
- Put print-only content in the export header or footer; exportLayout.body blocks are pruned as unreachable. (web only)
- Set the export ready signal (globalThis.__UA_EXPORT_READY__ = true) on the data source's success; the node timeout is a sleep. (web only)
- Keep exported content out of scroll containers and iframes; the first sheet edge cuts them. (web only)
- Don't use 100vh or h-full chains on an exported page; under print they are one sheet tall and clip the rest. (web only)
- Give the export node a full page object (format, layout, timeout) and a unique fileName per page. (web only)

## P2

- Lay out exported pages for paper width (794px on A4 portrait); a height set for 1440px does not hold. (web only)

## P3

- Print page numbers with an @page margin box in custom code and give the export node a margin on that side. (web only)
- Avoid 1px hairlines on pages exported at a fractional scale; they round to nothing. (web only)
