// Tells the Firebase files a person may hand over apart, and reads what the setup needs from the
// service-account key. The key's private_key stays in the returned object for the one call that
// sends it; describeFirebaseFile is what may be printed.
import fs from 'node:fs';

// The four files people mix up: the service-account key (what the setup needs), the two config
// files Firebase gives an app (what the setup makes), and Apple's APNs key.
const PEM_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----/u;
// Larger than any of the four files; a bigger one is something else and is not read whole.
const MAX_BYTES = 1024 * 1024;

export function readFirebaseFile(file) {
  if (fs.statSync(file).size > MAX_BYTES) return { kind: 'unknown' };
  const text = fs.readFileSync(file, 'utf8');
  const trimmed = text.trim();
  if (trimmed.startsWith('<') && text.includes('GOOGLE_APP_ID')) return { kind: 'ios-plist' };
  if (PEM_KEY.test(trimmed) && !trimmed.startsWith('{')) return { kind: 'apns-key' };
  let json;
  try { json = JSON.parse(text); } catch { return { kind: 'unknown' }; }
  if (json?.project_info?.project_number) {
    return { kind: 'google-services', projectNumber: String(json.project_info.project_number), projectId: json.project_info.project_id };
  }
  const { type, project_id: projectId, client_email: clientEmail, private_key: privateKey } = json ?? {};
  if (type === 'service_account' && projectId && clientEmail && typeof privateKey === 'string' && PEM_KEY.test(privateKey)) {
    return { kind: 'service-account', projectId, clientEmail, privateKey };
  }
  return { kind: 'unknown' };
}

const WHAT = {
  'service-account': 'the Firebase service-account key: the file the setup needs.',
  'google-services': 'google-services.json, the Android config file. The setup makes this file itself; it needs the service-account key instead.',
  'ios-plist': 'GoogleService-Info.plist, the iOS config file. The setup makes this file itself; it needs the service-account key instead.',
  'apns-key': "an Apple APNs key (.p8). It goes into Firebase's Cloud Messaging settings after the setup, not here; the setup needs the service-account key.",
  unknown: 'not a Firebase service-account key. Download one from Firebase: Project settings > Service accounts > Generate new private key.',
};

/** What may be printed about the file: never the key. */
export function describeFirebaseFile(read) {
  const { privateKey, ...rest } = read;
  return { ...rest, ...(privateKey ? { hasPrivateKey: true } : {}), is: WHAT[read.kind] };
}
