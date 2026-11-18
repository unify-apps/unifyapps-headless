// The sign-in addresses no page may be built at by hand. The platform serves an
// app's sign-in pages from the page with id `<appId>_login` (and the like) when
// the app has one, and its own page otherwise, so a page made with create_pages
// at /login is an ordinary page that is never shown, and the app keeps the
// platform's page. The only way to make a real one is a copy of the
// platform's template: create_auth_pages, or the builder's template gallery.
// Pure: no files, no network.

/** The sign-in kinds create_auth_pages makes, each at the address of its name. */
export const AUTH_PAGE_KINDS = Object.freeze(['login', 'signup', 'mfa-verification', 'forgot-password', 'update-password']);
/** Sign-in addresses the platform serves with no template to copy. */
const PLATFORM_ONLY = Object.freeze(['reset-password', 'public-login']);
const AUTH_ADDRESSES = new Set([...AUTH_PAGE_KINDS, ...PLATFORM_ONLY]);

const list = (value) => (Array.isArray(value) ? value : []);
const segments = (address) => String(address).split('/').map((part) => part.trim().toLowerCase()).filter(Boolean);
// The sign-in address a root-level path or a bare slug lands on, or null.
const rootAuthAddress = (address) => {
  if (typeof address !== 'string') return null;
  const parts = segments(address);
  return parts.length === 1 && AUTH_ADDRESSES.has(parts[0]) ? parts[0] : null;
};

// Every address a call would give a page: a path, or a slug when it sends no path.
function addressesOf(name, args) {
  const a = args && typeof args === 'object' ? args : {};
  if (name === 'create_pages') return list(a.pages).map((page) => (page?.path !== undefined ? page.path : page?.slug));
  if (name === 'update_pages') return list(a.edits).map((edit) => (edit?.set?.path !== undefined ? edit.set.path : edit?.set?.slug));
  if (name === 'copy_pages') return list(a.copies).map((copy) => copy?.slug);
  return [];
}

function refusalText(name, address) {
  const why = `${name} was not sent: /${address} is a sign-in address. A page put there by hand is an ordinary page that is never shown, and the app keeps the platform's own ${address} page, which already works.`;
  const way = AUTH_PAGE_KINDS.includes(address)
    ? ` To give the app its own ${address} page, call create_auth_pages {pages: [{kind: "${address}"}]} where the tenant serves it, then edit that page; it answers existing, with the page id, when the app already has one. Where the tenant does not serve it, the person adds it in App Builder from Add page → Templates.`
    : ` There is no template for ${address}, so the platform's page stays.`;
  return `${why}${way} An ordinary page that only shares the word goes in a folder, at a path such as /events/${address}.`;
}

/** The refusal for a call that would build a page at a sign-in address, else null. */
export function handBuiltAuthPage(name, args) {
  for (const address of addressesOf(name, args)) {
    const hit = rootAuthAddress(address);
    if (hit) return refusalText(name, hit);
  }
  return null;
}
