// The files a person hands the release skill: signing keys, store keys and the signing passwords
// file. Claude never reads any of them; this code does, and returns only what kind of file it is or
// which fields are still empty — never a byte of content, never a password.

import fs from 'node:fs';
import path from 'node:path';

const JKS_MAGIC = 0xfeedfeed;
const JCEKS_MAGIC = 0xcececece;
const DER_SEQUENCE = 0x30;
const PKCS12_EXTENSIONS = new Set(['.p12', '.pfx', '.keystore', '.jks']);

function jsonKind(text) {
  let value;
  try { value = JSON.parse(text); } catch { return null; }
  if (value?.project_info) return 'google-services';
  if (value?.type === 'service_account') {
    // Firebase's console names its own service accounts firebase-adminsdk-…; a Play release key is
    // one the team made in Google Cloud for Play Console.
    return String(value.client_email ?? '').startsWith('firebase-adminsdk') ? 'firebase-service-account' : 'play-service-account';
  }
  return null;
}

/**
 * What a file is, from its bytes: jks, pkcs12, mobileprovision, p8, play-service-account,
 * firebase-service-account, google-services, unknown, or missing.
 */
export function sniffFile(file) {
  let bytes;
  try { bytes = fs.readFileSync(file); } catch { return { kind: 'missing' }; }
  if (bytes.length >= 4) {
    const magic = bytes.readUInt32BE(0);
    if (magic === JKS_MAGIC || magic === JCEKS_MAGIC) return { kind: 'jks' };
  }
  if (bytes[0] === DER_SEQUENCE) {
    // A provisioning profile is a signed CMS envelope around a plist; a .p12 is DER with no plist.
    if (bytes.includes('<plist')) return { kind: 'mobileprovision' };
    if (PKCS12_EXTENSIONS.has(path.extname(file).toLowerCase())) return { kind: 'pkcs12' };
  }
  const text = bytes.toString('utf8');
  if (text.trimStart().startsWith('-----BEGIN PRIVATE KEY-----')) return { kind: 'p8' };
  return { kind: jsonKind(text) ?? 'unknown' };
}

const SIGNING_FIELDS = {
  android: ['keystorePassword', 'keyAlias', 'keyPassword'],
  ios: ['certificatePassword'],
};

const templatePath = (dir, platform) => path.join(dir, `signing-${platform}.json`);

function filled(values, platform) {
  return SIGNING_FIELDS[platform].filter((field) => typeof values?.[field] === 'string' && values[field].trim() !== '');
}

/** Writes the empty passwords file for `platform`, unless the person already filled it in. */
export function writeSigningTemplate(dir, platform) {
  const file = templatePath(dir, platform);
  let current = null;
  try { current = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* absent or broken: write it */ }
  if (current && filled(current, platform).length > 0) return file;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(Object.fromEntries(SIGNING_FIELDS[platform].map((f) => [f, ''])), null, 2)}\n`);
  return file;
}

/** The filled passwords for `platform`, or `{missing: [field names], invalid?: true}`. */
export function readSigningSecrets(file, platform) {
  const fields = SIGNING_FIELDS[platform];
  let values;
  try { values = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { missing: [...fields], invalid: true }; }
  const done = filled(values, platform);
  const missing = fields.filter((field) => !done.includes(field));
  if (missing.length) return { missing };
  return Object.fromEntries(fields.map((field) => [field, values[field]]));
}
