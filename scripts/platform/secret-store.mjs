// The OS secret store that holds each tenant's `_at` cookie. Every backend is a
// tool the OS already ships, so the plugin adds no dependency and no setup step.
// The cookie always travels on stdin: process arguments are visible to `ps`.
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SERVICE = 'unifyapps-nebula';

function run(command, args, input) {
  const result = spawnSync(command, args, { input, encoding: 'utf8', timeout: 15_000, windowsHide: true });
  return { ok: !result.error && result.status === 0, stdout: result.stdout ?? '' };
}

// Items written through `security` trust `security` itself, so reading them
// back never raises a Keychain prompt.
const keychain = {
  label: 'the macOS Keychain',
  read(host) {
    const result = run('/usr/bin/security', ['find-generic-password', '-s', SERVICE, '-a', host, '-w']);
    return result.ok ? result.stdout.trim() || undefined : undefined;
  },
  // `security -i` takes the command on stdin. The quotes are safe because a
  // cookie value can never contain `"` or `\` (see COOKIE_VALUE in auth.mjs).
  write(host, value) {
    return run('/usr/bin/security', ['-i'], `add-generic-password -U -s "${SERVICE}" -a "${host}" -w "${value}"\n`).ok;
  },
  remove(host) {
    run('/usr/bin/security', ['delete-generic-password', '-s', SERVICE, '-a', host]);
  },
};

// DPAPI encrypts with a key tied to this Windows user on this PC, so the file
// is useless anywhere else. Windows PowerShell 5.1 ships with Windows 10 and 11.
const PROTECT = "$ErrorActionPreference='Stop';Add-Type -AssemblyName System.Security;"
  + "$d=[Text.Encoding]::UTF8.GetBytes([Console]::In.ReadToEnd());"
  + "[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($d,$null,'CurrentUser'))";
const UNPROTECT = "$ErrorActionPreference='Stop';Add-Type -AssemblyName System.Security;"
  + "$b=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim());"
  + "[Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($b,$null,'CurrentUser'))";
const powershell = (script, input) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], input);

function dpapi(dir) {
  const fileFor = (host) => path.join(dir, `${host}.dpapi`);
  return {
    label: 'Windows DPAPI',
    read(host) {
      let blob;
      try { blob = readFileSync(fileFor(host), 'utf8'); }
      catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
      const result = powershell(UNPROTECT, blob);
      return result.ok ? result.stdout.trim() || undefined : undefined;
    },
    write(host, value) {
      const result = powershell(PROTECT, value);
      const blob = result.stdout.trim();
      if (!result.ok || !blob) return false;
      writePrivateFile(fileFor(host), blob);
      return true;
    },
    remove(host) {
      rmSync(fileFor(host), { force: true });
    },
  };
}

const secretService = {
  label: 'the Secret Service keyring',
  read(host) {
    const result = run('secret-tool', ['lookup', 'service', SERVICE, 'account', host]);
    return result.ok ? result.stdout.trim() || undefined : undefined;
  },
  write(host, value) {
    return run('secret-tool', ['store', '--label', `UnifyApps Headless (${host})`, 'service', SERVICE, 'account', host], value).ok;
  },
  remove(host) {
    run('secret-tool', ['clear', 'service', SERVICE, 'account', host]);
  },
};

export function writePrivateFile(file, content) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, content, { mode: 0o600 });
  chmodSync(file, 0o600);
}

/**
 * The store for this machine, or null when the cookie stays in a private file.
 * UA_COOKIE_STORE picks one explicitly: `file`, `keychain`, `dpapi` or
 * `secret-service`. Tests use `file` so they never touch the real Keychain.
 */
export function cookieStore(dir) {
  const choice = process.env.UA_COOKIE_STORE;
  if (choice === 'file') return null;
  if (choice === 'keychain' || (!choice && process.platform === 'darwin')) return keychain;
  if (choice === 'dpapi' || (!choice && process.platform === 'win32')) return dpapi(dir);
  // Without a session bus `secret-tool` can hang until the timeout on every
  // read, which is the usual state over SSH, in containers and in WSL.
  if (choice === 'secret-service' || (!choice && process.platform === 'linux' && process.env.DBUS_SESSION_BUS_ADDRESS)) return secretService;
  return null;
}
