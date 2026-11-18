/**
 * A page's job, and the design report of the task that builds the page.
 * Pure: no files, no network.
 *
 * The plan writes one `job` line for every new page, in the spec's `## Contract`
 * or the brief's `## Changes`:
 *
 *   - job · <page>: for <who, where, how often> · answers <first question>; <second> ·
 *     main action <what most visits end with, or none> · states <the states the page has> ·
 *     signals <values that need a state, with where each changes, or none>
 *
 * It says what the page is for and never how it looks, so it fits any page.
 * Under it the plan writes the page's design block, its regions top to bottom:
 *
 *   - design · <page>:
 *     - lead · <region>: <what it shows and does> · serves <part of the job>
 *     - support · <region>: <what it shows and does> · serves <part of the job>
 *     - later · <region>: <what it shows, and where it waits one click away> · serves <part of the job>
 *
 * Every command that writes a spec or brief (`spec draft`, `fast brief` and
 * the rest) refuses a new page with no complete job line, a job line with no
 * complete design block, and an app look line below a job line, because the
 * app is designed before its pages (`pageDesignProblem`); `plan create` hands both to
 * the page's layout and review tasks, and `plan report` refuses an `ok` layout
 * of that page without a `design` report that names every planned region
 * (`designReportProblem`).
 */
import { LOOK_LINE_SHAPE, readLookLine } from "./app-look.mjs";

const norm = (value) => String(value ?? "").trim().toLowerCase().replace(/\s+/gu, " ");

export const JOB_PARTS = ["for", "answers", "main action", "states", "signals"];

/** The shape of a job line, for a refusal to quote. */
export const JOB_LINE_SHAPE = "job · <page>: for <who, where, how often> · answers <first question>; <second question> · main action <what most visits end with, or none> · states <the states this page has> · signals <values that need a state and where each changes, or none>";

/** The shape of a design block, for a refusal to quote. */
export const DESIGN_LINE_SHAPE = '"design · <page>:" and under it one indented line per region, in page order from the top: ' +
  '"<lead|support|quiet|later> · <region>: <what it shows and does> · serves <part of the job>", with at least one lead; ' +
  'a later region waits one click away, and its text says where';

const JOB_LINE = /^\s*[-*]\s*job\s*·\s*([^:]+?)\s*:\s*(.*)$/iu;
const STATE_LINE = /^\s*[-*]\s*state\s*·\s*([^:]+?)\s*:\s*(.*)$/iu;
const LOOK_LINE = /^\s*[-*]\s*app look\s*·\s*([^:]+?)\s*:\s*(.*)$/iu;
const DESIGN_LINE = /^(\s*)[-*]\s*design\s*·\s*([^:]+?)\s*:\s*$/iu;
const SEPARATOR = /\s+·\s+/u;
const SERVES = /\s+·\s+serves(?:\s+|$)/giu;
// `later` is a region that waits one click away (a drawer, a tab, a detail
// page): planned with the page, but not on it when the page opens.
const WEIGHTS = ["lead", "support", "quiet", "later"];

// A line finds its page or app by name alone, so a second line with a name
// already read is marked, and pageDesignProblem refuses it.
function remember(found, key, value) {
  if (found.has(key)) value.twice = true;
  found.set(key, value);
}

/** Splits the text after `job · <page>:` into its labelled parts and says what is missing. */
export function readJob(text) {
  const parts = {};
  let last = null;
  for (const piece of String(text ?? "").split(/\s+·\s+/u)) {
    const label = JOB_PARTS.find((name) => new RegExp(`^${name}(\\s|$)`, "iu").test(piece.trim()));
    if (label) { last = label; parts[label] = piece.trim().slice(label.length).trim(); }
    else if (last) parts[last] = `${parts[last]} · ${piece.trim()}`;
  }
  const problems = JOB_PARTS.filter((name) => !parts[name]).map((name) => `"${name}" is missing or empty`);
  const answers = (parts.answers ?? "").split(";").map((q) => q.trim()).filter(Boolean);
  if (parts.answers && !answers.length) problems.push('"answers" needs at least one question');
  return { parts, answers, problems };
}

/** Every `job · <page>:` line in a spec or brief, by page name. */
export function readJobLines(body) {
  const jobs = new Map();
  for (const [at, line] of String(body ?? "").split(/\r?\n/u).entries()) {
    const match = JOB_LINE.exec(line);
    if (!match) continue;
    remember(jobs, norm(match[1]), { name: match[1].trim(), at, line: line.trim().replace(/^[-*]\s*/u, ""), ...readJob(match[2]) });
  }
  return jobs;
}

/** Every `app look · <app>:` line in a spec or brief, by app name. */
export function readLookLines(body) {
  const looks = new Map();
  for (const [at, line] of String(body ?? "").split(/\r?\n/u).entries()) {
    const match = LOOK_LINE.exec(line);
    if (!match) continue;
    remember(looks, norm(match[1]), { name: match[1].trim(), at, line: line.trim().replace(/^[-*]\s*/u, ""), ...readLookLine(match[2]) });
  }
  return looks;
}

/**
 * The values an app's pages share, in one `state · <app>:` line, so pages bound
 * side by side by different builders read and write the same names in the same
 * store instead of each inventing its own:
 *
 *   - state · <app>: <value> in <store> · written by <page> · read by <page>, <page>; <next value> in …
 *
 * The stores are the four places a value outlives one page: an app variable (a
 * variable on the global page; every page reads it, and a page load resets it),
 * session storage (until the tab closes), local storage (across reloads and
 * tabs), and a page input (passed in the address when one page opens another).
 */
export const STATE_STORES = Object.freeze(["app variable", "session storage", "local storage", "page input"]);

/** The shape of a state line, for a refusal to quote. */
export const STATE_LINE_SHAPE = `state · <app>: <value name> in <${STATE_STORES.join(" | ")}> · written by <page> · read by <page>, <page>; <next value> in …`;

/** Reads the text after `state · <app>:` into its values, and says what is missing. */
export function readState(text) {
  const values = [];
  const problems = [];
  for (const [index, piece] of String(text ?? "").split(";").map((part) => part.trim()).filter(Boolean).entries()) {
    const parts = piece.split(SEPARATOR).map((part) => part.trim());
    const head = /^(.+?)\s+in\s+(.+)$/iu.exec(parts[0] ?? "");
    const pages = (label) => (parts.find((part) => new RegExp(`^${label}\\s+`, "iu").test(part)) ?? "")
      .replace(new RegExp(`^${label}\\s+`, "iu"), "").split(",").map((page) => page.trim()).filter(Boolean);
    const value = { name: head?.[1].trim() ?? "", store: norm(head?.[2]), writtenBy: pages("written by"), readBy: pages("read by") };
    const which = value.name ? `"${value.name}"` : `value ${index + 1}`;
    if (!head) problems.push(`${which} needs "<value name> in <store>"`);
    else if (!STATE_STORES.includes(value.store)) problems.push(`${which} is in "${head[2].trim()}", not one of ${STATE_STORES.join(", ")}`);
    if (!value.writtenBy.length) problems.push(`${which} needs "written by <page>"`);
    if (!value.readBy.length) problems.push(`${which} needs "read by <page>"`);
    values.push(value);
  }
  if (!values.length) problems.push("it names no value");
  return { values, problems };
}

/** Every `state · <app>:` line in a spec or brief, by app name. */
export function readStateLines(body) {
  const states = new Map();
  for (const [at, line] of String(body ?? "").split(/\r?\n/u).entries()) {
    const match = STATE_LINE.exec(line);
    if (!match) continue;
    remember(states, norm(match[1]), { name: match[1].trim(), at, line: line.trim().replace(/^[-*]\s*/u, ""), ...readState(match[2]) });
  }
  return states;
}

/** One region line of a design block, `<weight> · <region>: <text> · serves <serves>`, read into its parts. */
function readRegion(line, number) {
  const first = SEPARATOR.exec(line);
  const weight = (first ? line.slice(0, first.index) : line).trim().toLowerCase();
  const rest = first ? line.slice(first.index + first[0].length) : "";
  const serving = [...rest.matchAll(SERVES)].at(-1);
  const middle = serving ? rest.slice(0, serving.index) : rest;
  const serves = serving ? rest.slice(serving.index + serving[0].length).trim() : "";
  const colon = middle.indexOf(":");
  const region = colon < 0 ? "" : middle.slice(0, colon).trim();
  const text = colon < 0 ? "" : middle.slice(colon + 1).trim();
  const problems = [];
  if (!WEIGHTS.includes(weight)) problems.push(`region line ${number} starts with "${weight}", not lead, support, quiet or later`);
  if (!region || !text) problems.push(`region line ${number} needs "<region>: <what it shows and does>"`);
  if (!serves) problems.push(`region line ${number} needs " · serves <part of the job>" at its end`);
  return { region: { weight, region, text, serves }, problems };
}

/**
 * Every `design · <page>:` block in a spec or brief, by page name. Its region
 * lines are the lines indented under it, up to the first line that is not.
 */
export function readDesignBlocks(text) {
  const blocks = new Map();
  let block = null;
  let depth = 0;
  for (const line of String(text ?? "").split(/\r?\n/u)) {
    if (!line.trim()) continue;
    if (block && /^\s*/u.exec(line)[0].length > depth) {
      const read = readRegion(line.trim().replace(/^[-*]\s*/u, ""), block.regions.length + 1);
      block.regions.push(read.region);
      block.problems.push(...read.problems);
      continue;
    }
    const match = DESIGN_LINE.exec(line);
    block = match ? { name: match[2].trim(), regions: [], problems: [] } : null;
    if (!match) continue;
    depth = match[1].length;
    remember(blocks, norm(match[2]), block);
  }
  for (const found of blocks.values()) {
    if (!found.regions.length) found.problems.push("it has no region lines under it");
    else if (!found.regions.some((region) => region.weight === "lead")) found.problems.push('no region is "lead"');
  }
  return blocks;
}

/**
 * Which plan line each of `lines` is: "job", "look", "state", "design" (a
 * design block's header or one of its region lines), or null. A builder's message
 * shows these lines on their own, so its spec lines leave them out.
 */
export function planLineKinds(lines) {
  let depth = -1;
  return lines.map((line) => {
    if (!line.trim()) return null;
    if (depth >= 0 && /^\s*/u.exec(line)[0].length > depth) return "design";
    const header = DESIGN_LINE.exec(line);
    depth = header ? header[1].length : -1;
    if (header) return "design";
    return JOB_LINE.test(line) ? "job" : LOOK_LINE.test(line) ? "look" : STATE_LINE.test(line) ? "state" : null;
  });
}

/** Why one `app look · <app>:` line is not ready, or null. `spec draft`, `fast brief` and the script that stores the look say it in these words. */
export function lookLineProblem(look) {
  if (!look.problems.length) return null;
  return `The app look line for ${look.name} is not ready: ${look.problems.join("; ")}. Write it as "${LOOK_LINE_SHAPE}", or "app look · ${look.name}: none because <reason>".`;
}

/**
 * Why a spec or brief is not ready on page jobs, page designs and app looks, or null.
 * `touches` are its parsed `## Touches` lines: a page with no id is new, and
 * so is an app.
 */
export function pageDesignProblem(body, touches) {
  const jobs = readJobLines(body);
  const looks = readLookLines(body);
  const designs = readDesignBlocks(body);
  const byPageName = "finds its page by name alone, so give the pages of different apps different names";
  const twiceJob = [...jobs.values()].find((job) => job.twice);
  if (twiceJob) return `Two job lines name ${twiceJob.name}. A line ${byPageName}.`;
  const twiceDesign = [...designs.values()].find((design) => design.twice);
  if (twiceDesign) return `Two design blocks name ${twiceDesign.name}. A block ${byPageName}.`;
  const twiceLook = [...looks.values()].find((look) => look.twice);
  if (twiceLook) return `Two app look lines name ${twiceLook.name}. A line finds its app by name alone, so write one line per app and give different apps different names.`;
  const states = readStateLines(body);
  const twiceState = [...states.values()].find((state) => state.twice);
  if (twiceState) return `Two state lines name ${twiceState.name}. Write one state line per app, with every shared value in it, separated by semicolons.`;
  for (const state of states.values()) {
    if (state.problems.length) return `The state line for ${state.name} is not ready: ${state.problems.join("; ")}. Write it as "${STATE_LINE_SHAPE}".`;
  }
  for (const job of jobs.values()) {
    if (job.problems.length) return `The job line for ${job.name} is not complete: ${job.problems.join("; ")}. Write it as "${JOB_LINE_SHAPE}".`;
  }
  for (const look of looks.values()) {
    const problem = lookLineProblem(look);
    if (problem) return problem;
  }
  // The app is designed before its pages: a page's regions use the look's
  // sizes, gaps, groups and bold thing, so the look is decided first.
  const firstJob = Math.min(...[...jobs.values()].map((job) => job.at));
  const lateLook = [...looks.values()].find((look) => look.at > firstJob);
  if (lateLook) return `The app look line for ${lateLook.name} comes after a page's job line. Decide the app first: write every app look line above the first job line, because each page's design uses the look's sizes, gaps, groups and bold thing.`;
  for (const ref of touches) {
    if (ref.kind === "page" && !ref.id && !jobs.has(norm(ref.name))) {
      return `The new page ${ref.name} needs a job line: "${JOB_LINE_SHAPE.replace("<page>", ref.name)}".`;
    }
    if (ref.kind === "app" && !ref.id && !looks.has(norm(ref.name))) {
      return `The new app ${ref.name} needs an app look line with its values: "${LOOK_LINE_SHAPE.replace("<app>", ref.name)}", or "app look · ${ref.name}: none because <reason>".`;
    }
  }
  for (const design of designs.values()) {
    if (design.problems.length) return `The design block for ${design.name} is not complete: ${design.problems.join("; ")}. Write it as ${DESIGN_LINE_SHAPE}.`;
  }
  for (const [page, job] of jobs) {
    if (!designs.has(page)) return `The page ${job.name} has a job line, so it needs a design block: ${DESIGN_LINE_SHAPE.replace("<page>", job.name)}.`;
  }
  for (const [page, design] of designs) {
    if (!jobs.has(page)) return `The design block for ${design.name} names no page with a job line. Use the page name its job line gives, or add "${JOB_LINE_SHAPE.replace("<page>", design.name)}".`;
  }
  return null;
}

/**
 * The sizes the app preview's "Switch variant" menu offers, the only sizes a
 * person sees the page at. The preview frame is 1440px wide until one is
 * picked. `browser.mjs page-shot` takes only these widths, and a design
 * report's two shots are at two of them.
 */
export const DEVICE_SIZES = Object.freeze([
  { width: 1366, height: 709, label: "Laptop" },
  { width: 1440, height: 834, label: "Laptop" },
  { width: 1680, height: 1050, label: "Desktop" },
  { width: 1920, height: 1080, label: "Desktop" },
  { width: 2560, height: 1440, label: "Desktop" },
].map(Object.freeze));

const ANSWERS = ["firstSeen", "signals", "dataOrder"];

/**
 * Why the `design` part of an `ok` report entry for a page with a job is not
 * enough, or null. Its shape:
 *
 *   { regions: [{ region, seen }], shots: [{ width, file }, { width, file }],
 *     firstSeen, signals, dataOrder }
 *
 * `regions` are the task's planned design regions (`plan create` put them on
 * the task); the report says what it saw of each one in the shots, matched by
 * region name. The shots are `browser.mjs page-shot` files of the preview at
 * two of the `DEVICE_SIZES` widths. `imageWidth(file)` returns a PNG's width
 * in pixels, or null when the file is no PNG it may read: `plan report` passes
 * one that reads the header of a file in `shotFolder`, where page-shot writes,
 * so this module touches no file itself.
 */
export function designReportProblem(design, { imageWidth = () => null, regions: planned = [], shotFolder = "your work folder" } = {}) {
  const how = "See the Rules in your message: take page-shot 1440 and page-shot 1366 of the preview, read both, and say what you saw of each region the message's Design names.";
  if (!design || typeof design !== "object" || Array.isArray(design)) return `An ok layout of a page with a job needs a "design" report. ${how}`;
  const reported = Array.isArray(design.regions) ? design.regions : [];
  if (!reported.length) return `"design.regions" is empty: list each region of the page with what you saw of it. ${how}`;
  for (const [i, region] of reported.entries()) {
    for (const key of ["region", "seen"]) {
      if (typeof region?.[key] !== "string" || !region[key].trim()) return `"design.regions" entry ${i + 1} needs "${key}" in words. ${how}`;
    }
  }
  const named = new Set(reported.map((region) => norm(region.region)));
  // A `later` region waits one click away, so the shots of the page do not show it.
  const missing = planned.filter((region) => region.weight !== "later" && !named.has(norm(region.region))).map((region) => `"${region.region}"`);
  if (missing.length) return `"design.regions" leaves out ${missing.join(", ")}: add an entry for each, with what you saw of it. ${how}`;
  const sizes = DEVICE_SIZES.map((size) => size.width);
  const shots = Array.isArray(design.shots) ? design.shots : [];
  for (const shot of shots) {
    if (!Number.isInteger(shot?.width) || typeof shot.file !== "string" || !shot.file.trim()) {
      return `Each "design.shots" entry needs "width" and "file", as page-shot printed them. ${how}`;
    }
    if (!sizes.includes(shot.width)) {
      return `The shot ${shot.file} is ${shot.width}px wide, which is no size the preview offers. Take page-shot 1440 and page-shot 1366; page-shot takes ${sizes.join(", ")}.`;
    }
    const pixels = imageWidth(shot.file);
    if (pixels !== shot.width && pixels !== shot.width * 2) {
      const what = pixels ? `PNG (it is ${pixels}px)` : `PNG file in ${shotFolder}, where page-shot writes`;
      return `The shot ${shot.file} is not a ${shot.width}px-wide ${what}: take it with page-shot ${shot.width} and report the file it prints.`;
    }
  }
  if (new Set(shots.map((shot) => shot.width)).size < 2) {
    return `"design.shots" needs shots at two different preview widths, such as 1440 and 1366; page-shot takes ${sizes.join(", ")}. ${how}`;
  }
  for (const key of ANSWERS) {
    if (typeof design[key] !== "string" || !design[key].trim()) return `"design.${key}" needs your answer in words, from the shots. ${how}`;
  }
  return null;
}

/**
 * How many times a review may send a page back to its builder. One: the
 * builder fixes the blocking findings and checks its own shots, and no second
 * review runs. In a 4-page build on 2026-10-09 the second round cost about 9
 * minutes on the critical path and a question to the person, for 2 spacing
 * findings.
 */
export const MAX_REVIEW_FIXES = 1;

/**
 * How much a finding matters. `blocks`: a person would hit it (a wrong or
 * misleading word or number, a control that cannot be told apart or reached,
 * cut-off text, data in the wrong order, a missing state or region). It goes
 * back to the builder before the app is published. `polish`: spacing, sizes,
 * colours or wording taste. It is offered to the person at the end, with the
 * links, and fixed only when they say so.
 */
export const FINDING_SEVERITIES = Object.freeze(["blocks", "polish"]);

/**
 * The qualities a page review scores one by one, each `pass` or `fix`. A judge
 * that scores named qualities one at a time agreed with people far more often
 * than one that gave a single verdict (69.5% against 48.5% in a 2026 study of
 * screenshot critics), so the review names each one.
 */
export const REVIEW_QUALITIES = Object.freeze(["hierarchy", "grouping", "alignment", "contrast", "readability", "consistency", "states"]);

/**
 * Why the `review` part of an `ok` page-review entry is not enough, or null.
 * Its shape: { verdict: "pass"|"fix", qualities: { <quality>: "pass"|"fix" },
 * findings: [{ where, what, job, severity, quality? }] }: a score for each of
 * `REVIEW_QUALITIES`, then for each finding where on the shots, what the
 * reviewer sees there, which part of the job it gets in the way of, how much
 * it matters (`FINDING_SEVERITIES`) and the quality it breaks. The verdict is
 * `fix` exactly when a finding `blocks`; polish alone passes. Each quality
 * scored `fix` needs a finding that names it.
 */
export function reviewProblem(review) {
  const shape = '{"verdict":"pass|fix","qualities":{"hierarchy":"pass|fix","grouping":"…","alignment":"…","contrast":"…","readability":"…","consistency":"…","states":"…"},"findings":[{"where":"","what":"","job":"","severity":"blocks|polish","quality":""}]}';
  if (!review || typeof review !== "object" || Array.isArray(review)) return `An ok page-review needs a "review": ${shape}.`;
  if (!["pass", "fix"].includes(review.verdict)) return `"review.verdict" must be pass or fix.`;
  const qualities = review.qualities;
  if (!qualities || typeof qualities !== "object" || Array.isArray(qualities)) return `"review.qualities" needs pass or fix for each of ${REVIEW_QUALITIES.join(", ")}: ${shape}.`;
  const unscored = REVIEW_QUALITIES.filter((name) => !["pass", "fix"].includes(qualities[name]));
  if (unscored.length) return `"review.qualities" needs pass or fix for ${unscored.join(", ")}.`;
  const findings = review.findings ?? [];
  if (!Array.isArray(findings)) return `"review.findings" must be a list: ${shape}.`;
  for (const [i, finding] of findings.entries()) {
    for (const key of ["where", "what", "job"]) {
      if (typeof finding?.[key] !== "string" || !finding[key].trim()) return `"review.findings" entry ${i + 1} needs "${key}" in words.`;
    }
    if (!FINDING_SEVERITIES.includes(finding.severity)) {
      return `"review.findings" entry ${i + 1} needs "severity": "blocks" when a person would hit it (a wrong or misleading word or number, a control they cannot tell apart or reach, cut-off text, data in the wrong order, a missing state or region), else "polish".`;
    }
    if (finding.quality && !REVIEW_QUALITIES.includes(finding.quality)) {
      return `"review.findings" entry ${i + 1} names the quality "${finding.quality}"; use one of ${REVIEW_QUALITIES.join(", ")}, or leave it out for a finding about the job or the design.`;
    }
  }
  const failing = REVIEW_QUALITIES.filter((name) => qualities[name] === "fix");
  for (const name of failing) {
    if (!findings.some((finding) => finding.quality === name)) return `"review.qualities.${name}" is fix, so it needs a finding with "quality": "${name}" that says where and what you see.`;
  }
  const blocking = findings.some((finding) => finding.severity === "blocks");
  if (review.verdict === "fix" && !blocking) return 'A "fix" verdict needs a finding with "severity": "blocks". Polish alone is a "pass": it is offered to the person at the end.';
  if (review.verdict === "pass" && blocking) return 'A finding has "severity": "blocks", so the verdict is "fix": the builder fixes it before the app is published.';
  return null;
}

/** One planned design region as one line, for a builder's or a reviewer's message. */
export const regionLine = (region) => `${region.weight} · ${region.region}: ${region.text} · serves ${region.serves}`;

/** One finding as one line, for a builder's message or a task's unverified list. */
export const findingLine = (finding) => `${finding.where}: ${finding.what} (${finding.quality ? `quality: ${finding.quality}; ` : ""}job: ${finding.job})`;

/** The polish a page's review found, one line each, for the person at the end. */
export const polishLines = (page, review) => (Array.isArray(review?.findings) ? review.findings : [])
  .filter((finding) => finding?.severity === "polish").map((finding) => `polish: ${page}: ${findingLine(finding)}`);

/** A review's scores as one line, for the next review's message. */
export const qualitiesLine = (qualities) => REVIEW_QUALITIES.map((name) => `${name} ${qualities?.[name] ?? "not scored"}`).join(" · ");
