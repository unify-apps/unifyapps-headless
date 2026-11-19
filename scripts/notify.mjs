#!/usr/bin/env node
// Notification hook: a desktop notification only when the MAIN agent stops
// to ask the user something — a permission prompt, an idle prompt, an
// elicitation dialog — so a session left running in one folder among several
// is found again without hunting through terminals. It ships in
// hooks/hooks.json, so every machine the plugin is installed on has it; a
// user who does not want it disables the hook in their settings
// (`disabledHooks`, or the /hooks menu), never this file.
//
// Two filters keep it quiet otherwise, and both are needed:
//   * hooks.json carries a matcher for the waiting types, so on current
//     builds the script is not even started for `agent_completed`,
//     `auth_success`, quota events and the rest.
//   * plugin hooks also run inside subagent sessions, and those events carry
//     `agent_id` / `agent_type`. A subagent finishing, or a subagent waiting
//     on something, is never the user's cue: it exits here without a sound.
//
// Claude Code writes the event on stdin: `notification_type`, `message` (older
// builds) or `notification_data: { title, message }` (newer), `cwd`,
// `session_id`. The title names the solution when the folder is bound
// (`UnifyApps Headless — <name>`), the body carries the message and the folder — the cwd,
// and the solution home when there is one — so the notification says WHERE.
//
// It must never fail a session: every step is wrapped, the spawn has a
// short timeout, and the exit code is 0 whatever happened. Nothing here reads
// or writes anything but the registry (read-only) and the OS notifier.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The main agent is waiting on the person. Everything else stays silent. */
export const WAITING_TYPES = Object.freeze(["permission_prompt", "idle_prompt", "elicitation_dialog", "elicitation_url_dialog"]);

/** True only for a waiting type raised by the main session, never by a subagent. */
export function shouldNotify(hook) {
  if (!hook || typeof hook !== "object") return false;
  if (hook.agent_id || hook.agent_type) return false;
  return WAITING_TYPES.includes(String(hook.notification_type ?? ""));
}

function main() {
  const exit0 = () => process.exit(0);
  process.on("uncaughtException", exit0);
  process.on("unhandledRejection", exit0);

  let hook = null;
  try { hook = JSON.parse(fs.readFileSync(0, "utf8") || "null"); } catch { hook = null; }
  if (!shouldNotify(hook)) exit0();

  const message = String(hook.message ?? hook.notification_data?.message ?? hook.notification_data?.title ?? "Claude is waiting for you").trim();
  const cwd = String(hook.cwd ?? process.cwd());

  let title = "UnifyApps Headless";
  let where = cwd;
  return import("./folder/local.mjs").then(({ homeForCwd, readRecord }) => {
    const sessionId = typeof hook.session_id === "string" ? hook.session_id : undefined;
    const binding = sessionId ? homeForCwd(cwd, sessionId) : null;
    const p = binding ? { home: binding.home, name: readRecord(binding.home, "solution")?.properties?.name } : null;
    if (p?.name) title = `UnifyApps Headless — ${p.name}`;
    if (p?.home) where = `${cwd}\nsolution: ${p.home}`;
  }).catch(() => { /* the registry is optional here — the folder alone still says where */ }).then(() => {
    const body = `${message}\n${where}`;
    // AppleScript string literal: backslash and double quote are the two escapes.
    const asq = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " — ");
    const run = (cmd, args, extra = {}) => {
      try { spawnSync(cmd, args, { stdio: "ignore", timeout: 4000, ...extra }); } catch { /* absent or slow notifier: silent */ }
    };
    try {
      if (process.platform === "darwin") {
        run("osascript", ["-e", `display notification "${asq(body)}" with title "${asq(title)}"`]);
      } else if (process.platform === "linux") {
        run("notify-send", ["--app-name=UnifyApps Headless", title, body]);
      } else if (process.platform === "win32") {
        // A WinRT toast; title and body travel as environment variables so no quoting is needed.
        const ps = [
          "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null",
          "$t = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)",
          "$x = $t.GetElementsByTagName('text')",
          "$x.Item(0).AppendChild($t.CreateTextNode($env:UA_NOTIFY_TITLE)) > $null",
          "$x.Item(1).AppendChild($t.CreateTextNode($env:UA_NOTIFY_BODY)) > $null",
          "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('UnifyApps Headless').Show([Windows.UI.Notifications.ToastNotification]::new($t))",
        ].join("; ");
        run("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], { env: { ...process.env, UA_NOTIFY_TITLE: title, UA_NOTIFY_BODY: body } });
      }
    } catch { /* never the session's problem */ }
    exit0();
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
