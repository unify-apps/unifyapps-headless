// A native slide's animation as PowerPoint timing XML: the scene's entrance plays by itself as the slide arrives, then
// each build is one click. Entrances (fade, float up or down, slide, zoom, wipe, word by word), exits, dims and moves.
//
// A click is over in under a second in any player. Its effects share BUDGET: those the deck starts within TOGETHER of
// each other start at once, and each later step starts after the one before (PowerPoint's After Previous). Keynote
// plays every effect of a click after the one before, whatever the file says, so it takes no longer than BUDGET either.
import { TOGETHER } from './model.mjs';

const BUDGET = 800, SHORTEST = 100, LONGEST = 400;

/**
 * builds: [[effect]] by build (0 plays as the slide arrives); an effect is { spid, text, type: 'in'|'out'|'dim'|'move',
 * effect, delay, dur, to (dim), dx, dy (move, in frame pixels from where the shape is drawn) }. '' when nothing moves.
 */
export function timingXml(builds) {
  let id = 2;
  const next = () => ++id;
  const grp = new Map(), bld = [];
  const groups = builds.map((effects, k) => ({ k, effects: [...effects].sort((a, b) => a.delay - b.delay) })).filter((g) => g.effects.length);
  if (!groups.length) return '';
  const pars = groups.map((g) => {
    const auto = g.k === 0;
    const dur = Math.round(Math.min(LONGEST, Math.max(SHORTEST, BUDGET / g.effects.length)));
    const steps = [];
    for (const e of g.effects) {
      const last = steps.at(-1);
      if (last && e.delay - last.start <= TOGETHER) last.effects.push(e); else steps.push({ start: e.delay, effects: [e] });
    }
    const outer = next();
    const inner = steps.map((st, s) => {
      const id = next();
      const kids = st.effects.map((e, i) => {
        const n = grp.get(e.spid) ?? 0;
        grp.set(e.spid, n + 1);
        if (e.text != null) bld.push(`<p:bldP spid="${e.spid}" grpId="${n}"${e.text ? '' : ' animBg="1"'}/>`);
        return effect(e, dur, n, i ? 'withEffect' : s ? 'afterEffect' : auto ? 'withEffect' : 'clickEffect', next);
      }).join('');
      return `<p:par><p:cTn id="${id}" fill="hold"><p:stCondLst><p:cond delay="${s * dur}"/></p:stCondLst><p:childTnLst>${kids}</p:childTnLst></p:cTn></p:par>`;
    }).join('');
    const start = auto ? '<p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond>' : '<p:cond delay="indefinite"/>';
    return `<p:par><p:cTn id="${outer}" fill="hold"><p:stCondLst>${start}</p:stCondLst><p:childTnLst>${inner}</p:childTnLst></p:cTn></p:par>`;
  }).join('');
  return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${pars}</p:childTnLst></p:cTn>`
    + '<p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst>'
    + (bld.length ? `<p:bldLst>${bld.join('')}</p:bldLst>` : '') + '</p:timing>';
}

// PowerPoint's preset for each effect, so its Animation pane names it: [presetID, class, subtype]. A float or a slide
// is written as a Fade that also moves a little: Keynote reads the preset, not the motion, and would bring a Float In
// or a Fly In from the slide's edge.
const DIR = { top: 1, right: 2, bottom: 4, left: 8 };
const WIPE = { left: 'right', right: 'left', top: 'down', bottom: 'up' };
const f3 = (v) => +v.toFixed(4);

function effect(e, dur, grpId, nodeType, next) {
  const own = next();
  const tgt = `<p:tgtEl><p:spTgt spid="${e.spid}"/></p:tgtEl>`;
  const cbhvr = (dur, attrs = [], extra = '') => `<p:cBhvr${extra}><p:cTn id="${next()}" dur="${dur}" fill="hold"/>${tgt}${attrs.length ? `<p:attrNameLst>${attrs.map((a) => `<p:attrName>${a}</p:attrName>`).join('')}</p:attrNameLst>` : ''}</p:cBhvr>`;
  const set = (attr, val, delay = 0) => `<p:set><p:cBhvr><p:cTn id="${next()}" dur="1" fill="hold"><p:stCondLst><p:cond delay="${delay}"/></p:stCondLst></p:cTn>${tgt}<p:attrNameLst><p:attrName>${attr}</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="${val}"/></p:to></p:set>`;
  const fade = (dir) => `<p:animEffect transition="${dir}" filter="fade">${cbhvr(dur)}</p:animEffect>`;
  const prop = (attr, from, to, ease = true) => `<p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="${next()}" dur="${dur}" fill="hold"${ease ? ' decel="100000"' : ''}/>${tgt}<p:attrNameLst><p:attrName>${attr}</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="${from}"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="${to}"/></p:val></p:tav></p:tavLst></p:anim>`;
  const fx = e.effect ?? { name: 'fade' };
  let preset, body;
  if (e.type === 'out') { preset = [10, 'exit', 0]; body = fade('out') + set('style.visibility', 'hidden', Math.max(0, dur - 1)); }
  else if (e.type === 'dim') { preset = [9, 'emph', 0]; body = `<p:set>${cbhvr(dur, ['style.opacity'])}<p:to><p:strVal val="${e.to}"/></p:to></p:set><p:animEffect filter="image" prLst="opacity: ${e.to}">${cbhvr(dur, [], ' rctx="IE"')}</p:animEffect>`; }
  else if (e.type === 'move') {
    preset = [0, 'path', 0];
    const ox = f3((e.from?.[0] ?? 0) / 1920), oy = f3((e.from?.[1] ?? 0) / 1080), x = f3(e.dx / 1920), y = f3(e.dy / 1080);
    body = `<p:animMotion origin="layout" path="M ${ox} ${oy} L ${x} ${y} E" pathEditMode="relative" ptsTypes="AA">${cbhvr(dur, ['ppt_x', 'ppt_y'])}</p:animMotion>`;
  } else {
    const show = set('style.visibility', 'visible');
    if (fx.name === 'rise' || fx.name === 'drop') {
      const dy = f3(Math.max(12, fx.y ?? 24) / 1080) * (fx.name === 'rise' ? 1 : -1);
      preset = [10, 'entr', 0];
      body = show + fade('in') + prop('ppt_x', '#ppt_x', '#ppt_x') + prop('ppt_y', `#ppt_y${dy >= 0 ? '+' : ''}${dy}`, '#ppt_y');
    } else if (fx.name === 'slide') {
      const dx = f3(Math.max(16, fx.x ?? 40) / 1920) * (fx.from === 'left' ? -1 : 1);
      preset = [10, 'entr', 0];
      body = show + fade('in') + prop('ppt_x', `#ppt_x${dx >= 0 ? '+' : ''}${dx}`, '#ppt_x') + prop('ppt_y', '#ppt_y', '#ppt_y');
    } else if (fx.name === 'zoom') {
      const s = f3(Math.min(0.9, Math.max(0, fx.scale ?? 0.4)));
      preset = [53, 'entr', 16];
      body = show + prop('ppt_w', `#ppt_w*${s}`, '#ppt_w') + prop('ppt_h', `#ppt_h*${s}`, '#ppt_h') + fade('in');
    } else if (fx.name === 'wipe') {
      preset = [22, 'entr', DIR[fx.from] ?? 8];
      body = `${show}<p:animEffect transition="in" filter="wipe(${WIPE[fx.from] ?? 'right'})">${cbhvr(dur)}</p:animEffect>`;
    } else { preset = [10, 'entr', 0]; body = show + fade('in'); }
  }
  // word by word: each word starts `gap` after the one before, as a share of one word's time in the deck
  const iterate = e.type === 'in' && fx.by === 'word' ? `<p:iterate type="wd"><p:tmPct val="${Math.max(1000, Math.min(100000, Math.round((fx.gap / e.dur) * 100000)))}"/></p:iterate>` : '';
  const [pid, cls, sub] = preset;
  return `<p:par><p:cTn id="${own}" presetID="${pid}" presetClass="${cls}" presetSubtype="${sub}" fill="hold"${e.text != null ? ` grpId="${grpId}"` : ''} nodeType="${nodeType}"><p:stCondLst><p:cond delay="0"/></p:stCondLst>${iterate}<p:childTnLst>${body}</p:childTnLst></p:cTn></p:par>`;
}
