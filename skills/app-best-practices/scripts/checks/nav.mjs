// Navigation (NAV): back controls, page-to-page actions and the Modal way out.
import { blockTarget, descendants, isBinding, isBlank, isFixedId, listOf, liveActions, oncePerTarget, routedPages, walkedFacts } from './shared.mjs';

// The ids navigateToPage accepts besides the app's own pages (actions/navigate-to-page.md).
const STANDARD_PAGE_IDS = new Set(['login', 'signup', 'public_login', 'update_password', 'mfa_verification', 'ua_governance_forgot_password', 'ua_governance_reset_password', 'ua-settings-user-activity', 'ua_settings_user_activity_matrix']);

const pageName = (app, pageId) => app.pages.find(page => page.id === pageId)?.name ?? pageId;

// navigateBack reads its pageId only with navigateToSpecificPage on.
const goesToPage = action => action.actionType === 'navigateToPage' || (action.actionType === 'navigateBack' && action.payload?.navigateToSpecificPage === true);

/** The `:param` names a navigation's pageParams leaves without a value, or null when that cannot be read. */
function unfilledParams(app, payload) {
  const pageId = payload?.pageId;
  if (!isFixedId(pageId)) return null;
  const address = routedPages(app).find(entry => entry.id === pageId)?.path;
  const params = (address ?? '').split('/').filter(segment => segment.startsWith(':')).map(segment => segment.slice(1));
  if (!params.length) return null;
  const items = payload.pageParams ?? [];
  if (!Array.isArray(items) || items.some(item => isBinding(item?.key))) return null;
  // resolveDynamicPath drops an item whose value is empty; a binding is taken as filled.
  const filled = new Set(items.filter(item => item?.key && !isBlank(item.value)).map(item => item.key));
  const missing = params.filter(param => !filled.has(param));
  return missing.length ? { missing, address } : null;
}

const pathMatches = (path, address) => {
  const want = address.split('/').filter(Boolean);
  const got = path.split('/').filter(Boolean);
  return want.length === got.length && want.every((segment, index) => segment.startsWith(':') || segment === got[index]);
};

const BACK_ICONS = new Set(['ArrowLeft', 'ArrowNarrowLeft', 'ChevronLeft', 'XClose']);
const BACK_WORDS = new Set(['back', 'close', 'cancel', 'dismiss']);

const iconName = value => {
  const name = typeof value === 'string' ? value : value?.value;
  return typeof name === 'string' ? name.replace(/^Svg/u, '') : null;
};
const words = name => String(name).replace(/([a-z0-9])([A-Z])/gu, '$1 $2').toLowerCase().split(/[^a-z0-9]+/u);

/** What says this control goes back, per config-review.md § Navigation, or null. */
function backSignal(page, fact) {
  const displayName = page.blocks[fact.id]?.displayName;
  if (displayName && words(displayName).some(word => BACK_WORDS.has(word))) return `named "${displayName}"`;
  const own = fact.type === 'IconButton' ? fact.content.icon : fact.type === 'Button' ? fact.content.startDecorator : null;
  if (BACK_ICONS.has(iconName(own))) return `${fact.type === 'IconButton' ? 'content.icon' : 'content.startDecorator'} is ${iconName(own)}`;
  if (fact.type !== 'Pressable') return null;
  const icon = descendants(page, fact.id).find(child => child.type === 'Icon' && BACK_ICONS.has(iconName(child.content.icon)));
  return icon ? `its Icon ${icon.id} shows ${iconName(icon.content.icon)}` : null;
}

function closesModal(action, modalId) {
  const { actionType, payload } = action;
  if (actionType === 'controlModal' && payload?.operation === 'hide') return payload.modalId === modalId || isBinding(payload.modalId);
  if (actionType === 'controlBlockMethod' && payload?.methodName === 'hideModal') return payload.blockId === modalId || isBinding(payload.blockId);
  // A script can call b_<id>.hideModal() (actions/execute-script.md), so one naming the modal counts.
  return actionType === 'executeScript' && String(payload?.script ?? '').includes(modalId);
}

export const navChecks = [
  {
    id: 'give-back-control-event-back',
    run: page => {
      const live = new Set(liveActions(page).map(entry => entry.target.id));
      return walkedFacts(page, 'Pressable', 'Button', 'IconButton').flatMap(fact => {
        if (live.has(fact.id)) return [];
        // A submit or reset Button acts through its form without an event.
        if (fact.type === 'Button' && ['submit', 'reset'].includes(fact.content.type)) return [];
        const signal = backSignal(page, fact);
        if (!signal) return [];
        if ([...fact.ancestors, ...descendants(page, fact.id).map(child => child.id)].some(id => live.has(id))) return [];
        const stored = listOf(page.blocks[fact.id]?.events).length;
        return [{ target: blockTarget(page, fact.id), evidence: `${fact.type} ${signal} and ${stored ? 'no entry in events runs an action' : 'events is empty'}, so pressing it does nothing` }];
      });
    },
  },
  {
    id: 'pair-navigatetospecificpage-true-real-pageid',
    run: (page, app) => {
      const known = new Set([...app.pagePaths.pages, ...app.pagePaths.unplaced].map(entry => entry.id));
      return oncePerTarget(liveActions(page).flatMap(({ target, path, action }) => {
        if (action.actionType !== 'navigateBack' || action.payload?.navigateToSpecificPage !== true) return [];
        const pageId = action.payload.pageId;
        if (isBlank(pageId)) return [{ target, evidence: `${path}.payload has navigateToSpecificPage true and no pageId, so it does a plain back` }];
        if (isBinding(pageId) || !known.size || known.has(pageId) || STANDARD_PAGE_IDS.has(pageId) || app.pages.some(entry => entry.id === pageId)) return [];
        return [{ target, evidence: `${path}.payload.pageId is "${pageId}", which names no page of this app` }];
      }));
    },
  },
  {
    id: 'link-apps-pages-navigatetopage-never',
    run: (page, app) => {
      const addresses = routedPages(app);
      return oncePerTarget(liveActions(page).flatMap(({ target, path, action }) => {
        const raw = action.actionType === 'navigate' ? action.payload?.path : null;
        if (typeof raw !== 'string' || isBinding(raw)) return [];
        const route = raw.trim().split(/[?#]/u)[0];
        if (!/^\/(?!\/)/u.test(route) && !/^[\w-]+(?:\/[\w-]+)*$/u.test(route)) return [];
        const match = addresses.find(entry => pathMatches(route, entry.path));
        return match ? [{ target, evidence: `${path}.payload.path is "${raw}", the address of page "${pageName(app, match.id)}" (${match.id}); use navigateToPage` }] : [];
      }));
    },
  },
  {
    id: 'keep-way-close-modal-hideonclickoutside',
    run: (page, app) => {
      const actions = liveActions(page);
      const scripts = JSON.stringify(page.functions);
      return walkedFacts(page, 'Modal').flatMap(fact => {
        const content = page.blocks[fact.id]?.component?.content;
        if (!content || typeof content !== 'object' || content.variant === 'page') return [];
        // The phone has no Escape key, so only a backdrop tap counts there.
        const flags = app.type === 'MOBILE' ? ['hideOnClickOutside'] : ['hideOnClickOutside', 'hideOnEscape'];
        if (flags.some(flag => isBinding(content[flag]) || Boolean(content[flag]))) return [];
        if (scripts.includes(fact.id) || actions.some(({ action }) => closesModal(action, fact.id))) return [];
        const read = flags.map(flag => `content.${flag} is ${content[flag] === undefined ? 'absent' : JSON.stringify(content[flag])}`).join(', ');
        return [{ target: blockTarget(page, fact.id), evidence: `${read}, and no controlModal hide or hideModal names this Modal, so it cannot be closed` }];
      });
    },
  },
  {
    id: 'pass-page-input-navigation-item',
    run: (page, app) => {
      const paired = new Set(walkedFacts(page, 'NavigationContainer').map(fact => fact.content.navigationMenuId));
      const findings = [];
      const visit = (menu, items, prefix) => listOf(items).forEach((item, index) => {
        const path = `${prefix}[${index}]`;
        if (item?.type === 'group') return visit(menu, item.items, `${path}.items`);
        if (item?.type !== 'label' || item.variant !== 'page' || typeof item.pageId !== 'string' || isBinding(item.inputs)) return;
        const destination = app.pages.find(entry => entry.id === item.pageId);
        const inputSchema = destination?.record?.properties?.inputSchema;
        // The runner applies `default` only under ua:valueSemanticsVersion 2,
        // and there `ua:builderValue` is a builder-only sample.
        const authored = inputSchema?.layout?.['ua:valueSemanticsVersion'] === 2;
        const passed = item.inputs && typeof item.inputs === 'object' ? item.inputs : {};
        const missing = Object.entries(inputSchema?.schema?.properties ?? {})
          .filter(([name, property]) => !Object.hasOwn(passed, name) && (authored ? property && 'ua:builderValue' in property && property.default === undefined : property?.default !== undefined))
          .map(([name]) => name);
        if (missing.length) findings.push({ target: blockTarget(page, menu.id), evidence: `${path}.inputs leaves out ${missing.map(name => `"${name}"`).join(', ')}, which page "${destination.name}" (${item.pageId}) fills only in the builder and preview (inputSchema ${authored ? 'ua:builderValue' : 'default, no ua:valueSemanticsVersion 2'})` });
      });
      for (const fact of walkedFacts(page, 'Navigation')) if (paired.has(fact.id)) visit(fact, fact.content.navItems, 'content.navItems');
      return oncePerTarget(findings);
    },
  },
  {
    id: 'fill-param-target-page-navigatetopage',
    run: (page, app) => oncePerTarget(liveActions(page).flatMap(({ target, path, action }) => {
      if (!goesToPage(action)) return [];
      const gap = unfilledParams(app, action.payload);
      return gap ? [{ target, evidence: `${path}.payload.pageParams leaves ${gap.missing.map(param => `:${param}`).join(', ')} of ${gap.address} unfilled, so the published app does not navigate` }] : [];
    })),
  },
];
