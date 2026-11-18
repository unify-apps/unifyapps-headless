/** Which names a zip may hold before anything is unpacked from it. Pure. */

/**
 * Throws when an archive lists nothing, or any entry that could land outside the
 * folder it is unpacked into: an absolute path, a drive letter, a backslash, a NUL,
 * an empty segment, `.` or `..`. Used for an update package and for a code app's
 * downloaded codebase alike; `what` names which in the message.
 */
export function validateArchiveEntries(entries, what = "The update package") {
  if (!Array.isArray(entries) || !entries.length) throw new Error(`${what} is empty.`);
  for (const raw of entries) {
    const entry = String(raw).trim();
    const parts = entry.replace(/\/$/u, "").split("/");
    if (!entry || entry.includes("\\") || entry.includes("\0") || entry.startsWith("/") || /^[A-Za-z]:/u.test(entry) ||
        parts.some((part) => !part || part === "." || part === "..")) {
      throw new Error(`${what} contains an unsafe path: ${entry || "<empty>"}.`);
    }
  }
}
