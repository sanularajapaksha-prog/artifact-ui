#!/usr/bin/env node
// Renders the artifact (ref mode) or the built preview page (build mode) in a
// real browser and measures every element: fonts, typography, colors, box,
// layout, theme tokens, hover states and motion, at several screen sizes.
//
// Usage:
//   capture.mjs --data <dir> --mode ref   --target <artifact file or URL> --out <dir> [--widths 1440,768,390]
//   capture.mjs --data <dir> --mode build --target <preview URL>          --out <dir>
//   capture.mjs --data <dir> --mode probe --target <URL>   prints "open" or "login needed"
//   capture.mjs --data <dir> --mode login --target <URL>   opens a browser window; the user logs in
// ref   writes ref.json, ref-map.md and ref-<size>.png
// build writes build.json and build-<size>.png, reusing the sizes, hover
//       targets and token names recorded in ref.json (so ref must run first).
// login saves the session (cookies, local/session storage, IndexedDB - never a
//       password) to <data>/auth/<host>.json; every later capture of that site uses it.
// .jsx/.tsx artifacts are rendered through a small React harness (CDN).
// Exit codes: 0 captured, 1 failed (reason printed), 2 usage error.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchBrowser } from './lib/deps.mjs';

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  return v !== undefined && !v.startsWith('--') ? v : true;
};
const data = flag('data');
const mode = flag('mode');
const target = flag('target');
const out = flag('out');
const pageMode = mode === 'ref' || mode === 'build';
if (typeof data !== 'string' || !['ref', 'build', 'probe', 'login'].includes(mode) || typeof target !== 'string' || (pageMode && typeof out !== 'string')) {
  console.error('capture: --data, --mode ref|build|probe|login and --target are required (--out for ref and build)');
  process.exit(2);
}
const timeoutMs = (Number(flag('timeout')) || 60) * 1000;
const HEIGHT = 900;
const MAX_HOVERS = 80;

class CaptureError extends Error {}
const fail = (msg) => { throw new CaptureError(msg); };
const outDir = path.resolve(typeof out === 'string' ? out : '.');

// ---------- saved login sessions ----------
const authFile = (url) => {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return null;
    return path.join(path.resolve(data), 'auth', `${u.host.replace(/[^\w.-]/g, '_')}.json`);
  } catch { return null; }
};
async function newContext(browser, url, options) {
  const file = authFile(url);
  const saved = file && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  const context = await browser.newContext({ ...options, ...(saved ? { storageState: saved.state } : {}) });
  // Playwright's storage state has no sessionStorage; restore it before the app's scripts run.
  if (saved?.session) {
    await context.addInitScript((s) => {
      const items = s[location.origin];
      if (items && !sessionStorage.getItem('__pr_restored')) {
        for (const [k, v] of Object.entries(items)) sessionStorage.setItem(k, v);
        sessionStorage.setItem('__pr_restored', '1');
      }
    }, saved.session);
  }
  return context;
}
const LOGIN_URL = /\/(login|log-in|signin|sign-in|sign_in|auth|oauth2?|sso|authorize)(\/|\?|$)|login\.microsoftonline\.com|accounts\.google\.com|\.auth0\.com|\.okta\.com|clerk\./i;
async function looksLikeLogin(page) {
  if (LOGIN_URL.test(page.url())) return true;
  return page.evaluate(() => [...document.querySelectorAll('input[type=password]')].some((i) => i.offsetParent !== null)).catch(() => false);
}

async function probe() {
  const browser = await launchBrowser(data);
  try {
    const page = await (await newContext(browser, target, { viewport: { width: 1440, height: HEIGHT } })).newPage();
    try { await page.goto(target, { waitUntil: 'load', timeout: timeoutMs }); } catch (e) { fail(`the page did not load (${e.message.split('\n')[0]})`); }
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500);
    console.log(await looksLikeLogin(page) ? `login needed (landed on ${page.url()})` : 'open');
  } finally { await browser.close(); }
}

async function login() {
  const file = authFile(target);
  if (!file) fail('login needs an http(s) URL');
  const browser = await launchBrowser(data, { headless: false });
  try {
    const context = await browser.newContext({ viewport: null });
    const page = await context.newPage();
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: timeoutMs }).catch(() => {});
    console.log('Log in in the browser window that just opened. It closes by itself once you are in.');
    const origin = new URL(target).origin;
    const started = Date.now();
    const deadline = started + 10 * 60 * 1000;
    let okCount = 0;
    let sawLogin = false;
    while (Date.now() < deadline) {
      if (page.isClosed()) fail('the login window was closed before the login finished');
      await page.waitForTimeout(1000);
      const onSite = (() => { try { return new URL(page.url()).origin === origin; } catch { return false; } })();
      const atLogin = await looksLikeLogin(page);
      sawLogin ||= atLogin;
      okCount = onSite && !atLogin ? okCount + 1 : 0;
      // Save only after a login page was seen (so a slow redirect to it isn't mistaken for "logged in"),
      // or after 20s on the site with no login page at all (already logged in).
      if (okCount >= 3 && (sawLogin || Date.now() - started > 20000)) {
        const state = await context.storageState({ indexedDB: true });
        const session = { [origin]: await page.evaluate(() => Object.fromEntries(Object.entries(sessionStorage))) };
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify({ savedAt: new Date().toISOString(), state, session }));
        console.log(`✔ login saved for ${new URL(target).host} - later captures of this site use it`);
        return;
      }
    }
    fail('no login within 10 minutes');
  } finally { await browser.close().catch(() => {}); }
}

// ---------- everything below prInit runs inside the page ----------
function prInit() {
  const anims = [];
  const seen = new WeakSet();
  const grab = () => {
    try { for (const a of document.getAnimations()) if (!seen.has(a)) { seen.add(a); anims.push(a); } } catch { /* page not ready */ }
  };
  // Poll so short load animations are recorded even if they end before we look.
  const timer = setInterval(grab, 40);
  setTimeout(() => clearInterval(timer), 30000);

  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'LINK', 'META', 'BR', 'TITLE', 'BASE', 'HEAD']);
  const PROPS = [
    'fontWeight', 'fontStyle',
    'fontSize', 'lineHeight', 'letterSpacing', 'textTransform', 'textAlign', 'textDecorationLine', 'color',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
    'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius',
    'backgroundColor', 'backgroundImage', 'opacity', 'boxShadow', 'transform', 'filter', 'backdropFilter',
    'display', 'position', 'flexDirection', 'flexWrap', 'justifyContent', 'alignItems', 'rowGap', 'columnGap', 'gridTemplateColumns',
    'cursor',
    'transitionProperty', 'transitionDuration', 'transitionTimingFunction', 'transitionDelay',
    'animationDuration', 'animationTimingFunction', 'animationDelay', 'animationIterationCount',
  ];
  const HOVER_PROPS = ['color', 'backgroundColor', 'backgroundImage', 'borderTopColor', 'boxShadow', 'opacity', 'transform', 'textDecorationLine', 'outlineColor'];
  const COLOR = new Set(['color', 'backgroundColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor', 'outlineColor', 'fill', 'stroke']);

  let ctx;
  // One format for every color (rgb, oklch, color(), hex): rgba(r,g,b,a) in sRGB.
  const nc = (c) => {
    if (!c || c === 'transparent') return 'rgba(0,0,0,0)';
    const m = c.match(/^rgba?\(([^)]+)\)$/);
    if (m) {
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return `rgba(${Math.round(p[0])},${Math.round(p[1])},${Math.round(p[2])},${+(p[3] ?? 1).toFixed(3)})`;
    }
    if (!ctx) { const cv = document.createElement('canvas'); cv.width = cv.height = 1; ctx = cv.getContext('2d', { willReadFrequently: true }); }
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return `rgba(${d[0]},${d[1]},${d[2]},${+(d[3] / 255).toFixed(3)})`;
  };
  // next/font renames families to __Inter_1a2b3c; compare the real family name.
  const fam = (f) => f.split(',')[0].replace(/["']/g, '').trim().replace(/^__(.+?)(_Fallback)?_[0-9a-f]{5,}$/i, '$1').replace(/_/g, ' ').toLowerCase();
  const own = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  const visible = (el, cs = getComputedStyle(el)) => {
    const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  };
  const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };
  const iconSig = (svg) => hash([...svg.querySelectorAll('*')].map((n) => n.tagName
    + ['d', 'points', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height'].map((a) => n.getAttribute(a) ?? '').join(',')).join('|'));
  const ms = (list) => list.split(',').map((t) => (t.trim().endsWith('ms') ? parseFloat(t) : parseFloat(t) * 1000) || 0);
  const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  function eachRule(fn) {
    const walk = (rules) => { for (const r of rules) { fn(r); if (r.cssRules) walk(r.cssRules); } };
    for (const sheet of document.styleSheets) { try { walk(sheet.cssRules); } catch { /* cross-origin sheet */ } }
  }

  const byId = new Map();
  let attr = 'data-pr';

  window.__pr = {
    assignRef() {
      attr = 'data-pr';
      const harnessRoot = window.__prReady ? document.getElementById('root') : null;
      const els = [...document.body.querySelectorAll('*')].filter((el) => !SKIP.has(el.tagName) && !el.ownerSVGElement && el !== harnessRoot);
      const pad = els.length > 999 ? 4 : 3;
      els.forEach((el, i) => { const id = `r-${String(i + 1).padStart(pad, '0')}`; el.setAttribute(attr, id); byId.set(id, el); });

      // Sections: descend through single-child wrappers, then each child is a section.
      const kids = (e) => [...e.children].filter((k) => byId.get(k.getAttribute(attr)) === k);
      let root = harnessRoot || document.body;
      for (;;) {
        const vis = kids(root).filter((k) => visible(k));
        if (vis.length === 1 && vis[0].tagName.toLowerCase() !== 'svg' && kids(vis[0]).length) root = vis[0]; else break;
      }
      let secEls = kids(root);
      if (!secEls.length && byId.get(root.getAttribute(attr)) === root) secEls = [root];
      const name = (s, i) => (s.getAttribute('aria-label') || s.querySelector('h1,h2,h3,h4,h5,h6')?.textContent || s.id || own(s)
        || (['div', 'span'].includes(s.tagName.toLowerCase()) && typeof s.className === 'string' ? s.className.split(/\s+/)[0] : '')
        || s.tagName.toLowerCase())
        .replace(/\s+/g, ' ').trim().slice(0, 40) || `section ${i + 1}`;
      const sections = secEls.map((s, i) => ({
        id: `s-${String(i + 1).padStart(2, '0')}`, name: name(s, i), root: s.getAttribute(attr), hiddenAtLoad: !visible(s),
      }));
      const elements = {};
      let wrapperRoot = null;
      for (const [id, el] of byId) {
        const si = secEls.findIndex((s) => s.contains(el));
        let depth = 0;
        if (si >= 0) for (let p = el; p !== secEls[si]; p = p.parentElement) depth++;
        if (si < 0 && !wrapperRoot) wrapperRoot = id;
        elements[id] = { tag: el.tagName.toLowerCase(), text: own(el), section: si >= 0 ? sections[si].id : 's-00', depth };
      }
      if (wrapperRoot) sections.unshift({ id: 's-00', name: 'Page wrapper', root: wrapperRoot, hiddenAtLoad: false });
      return { sections, elements };
    },

    assignBuild() {
      attr = 'data-ref';
      const duplicates = {};
      for (const el of document.querySelectorAll('[data-ref]')) {
        const id = el.getAttribute(attr);
        if (byId.has(id)) duplicates[id] = (duplicates[id] || 1) + 1; else byId.set(id, el);
      }
      const elements = {};
      for (const [id, el] of byId) elements[id] = { tag: el.tagName.toLowerCase(), text: own(el) };
      return { elements, duplicates };
    },

    async settle() {
      window.scrollTo(0, 0);
      await document.fonts.ready;
      await raf2();
      // Finish entrance animations; freeze looping ones at their start so both sides match.
      for (const a of document.getAnimations()) {
        try {
          const t = a.effect?.getComputedTiming();
          if (t && Number.isFinite(t.endTime)) { if (a.playState !== 'finished') a.finish(); } else { a.pause(); a.currentTime = 0; }
        } catch { /* animation without an end */ }
      }
      await raf2();
    },

    async scrollThrough() {
      const step = Math.max(200, innerHeight * 0.8);
      for (let y = 0, n = 0; y < document.documentElement.scrollHeight && n < 60; y += step, n++) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 300));
    },

    measure() {
      const loaded = new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => fam(f.family)));
      const res = {};
      for (const [id, el] of byId) {
        if (!el.isConnected) { res[id] = { visible: false }; continue; }
        const cs = getComputedStyle(el);
        if (!visible(el, cs)) { res[id] = { visible: false }; continue; }
        const r = el.getBoundingClientRect();
        const s = { fontFamily: fam(cs.fontFamily) };
        s.fontLoaded = loaded.has(s.fontFamily) ? 'web font loaded' : 'no web font';
        for (const p of PROPS) s[p] = COLOR.has(p) ? nc(cs[p]) : cs[p];
        s.text = own(el);
        s.w = r.width;
        s.h = r.height;
        if (el.tagName.toLowerCase() === 'svg') { s.fill = nc(cs.fill); s.stroke = nc(cs.stroke); s.icon = iconSig(el); }
        // t = fingerprint of all text inside, so compare --live-data can tell data-driven elements apart.
        res[id] = { visible: true, s, r: { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, t: hash(el.textContent.replace(/\s+/g, ' ').trim()) } };
      }
      return res;
    },

    tokens(names) {
      if (!names) {
        const defined = new Set();
        let text = '';
        eachRule((r) => {
          if (r.style) for (const p of r.style) if (p.startsWith('--') && !p.startsWith('--tw-')) defined.add(p);
          if (r.cssText?.includes('var(--')) text += r.cssText;
        });
        for (const el of document.querySelectorAll('[style*="var(--"]')) text += el.getAttribute('style');
        const used = new Set([...text.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]));
        names = [...defined].filter((n) => used.has(n)).sort();
      }
      const el = byId.values().next().value || document.documentElement;
      const cs = getComputedStyle(el);
      const outTokens = {};
      for (const n of names) {
        const v = cs.getPropertyValue(n).trim();
        outTokens[n] = v && CSS.supports('color', v) ? nc(v) : v;
      }
      return outTokens;
    },

    hasDark() {
      let dark = false;
      eachRule((r) => { if (r.media && /prefers-color-scheme\s*:\s*dark/i.test(r.media.mediaText)) dark = true; });
      return dark;
    },

    hoverTargets() {
      const found = new Set();
      eachRule((r) => {
        if (!r.selectorText?.includes(':hover')) return;
        for (const part of r.selectorText.split(',')) {
          const i = part.indexOf(':hover');
          if (i < 0) continue;
          // "A:hover B" -> hover A; "&:hover" nested rules are skipped.
          const sel = part.slice(0, i).trim();
          if (!sel || sel.endsWith('&')) continue;
          try { for (const el of document.querySelectorAll(sel)) found.add(el); } catch { /* selector the browser rejects */ }
        }
      });
      for (const el of byId.values()) {
        const cs = getComputedStyle(el);
        if (cs.cursor === 'pointer' && (!el.parentElement || getComputedStyle(el.parentElement).cursor !== 'pointer')) found.add(el);
      }
      return [...byId].filter(([, el]) => found.has(el) && visible(el)).map(([id]) => id);
    },

    hoverPoint(id) {
      const el = byId.get(id);
      if (!el || !visible(el)) return null;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      const x = r.left + Math.min(r.width / 2, 20);
      const y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      if (!hit || !(hit === el || el.contains(hit))) return null;
      let wait = 150;
      for (const n of [el, ...el.querySelectorAll('*')]) {
        const cs = getComputedStyle(n);
        const d = ms(cs.transitionDuration);
        const dl = ms(cs.transitionDelay);
        d.forEach((v, i) => { wait = Math.max(wait, v + (dl[i % dl.length] || 0) + 60); });
      }
      return { x, y, wait: Math.min(wait, 1200) };
    },

    snap(id) {
      const el = byId.get(id);
      const res = {};
      for (const n of [el, ...el.querySelectorAll(`[${attr}]`)]) {
        const nid = n.getAttribute(attr);
        if (byId.get(nid) !== n) continue;
        const cs = getComputedStyle(n);
        res[nid] = Object.fromEntries(HOVER_PROPS.map((p) => [p, COLOR.has(p) ? nc(cs[p]) : cs[p]]));
      }
      return res;
    },

    motion() {
      grab();
      clearInterval(timer);
      const res = {};
      for (const a of anims) {
        if (a.constructor?.name === 'CSSTransition') continue;
        const eff = a.effect;
        const el = eff?.target;
        if (!el || eff.pseudoElement || !el.getAttribute) continue;
        const id = el.getAttribute(attr);
        if (!id || byId.get(id) !== el) continue;
        const t = eff.getTiming();
        const kf = eff.getKeyframes().map((k) => Object.fromEntries(Object.keys(k).sort()
          .filter((key) => key !== 'composite' && key !== 'computedOffset').map((key) => [key, k[key]])));
        (res[id] ||= []).push({
          duration: t.duration, delay: t.delay, easing: t.easing, iterations: t.iterations,
          direction: t.direction, fill: t.fill, keyframes: JSON.stringify(kf),
        });
      }
      for (const list of Object.values(res)) list.sort((x, y) => (x.keyframes < y.keyframes ? -1 : 1));
      return res;
    },
  };
}

function harnessHtml(source) {
  const src = JSON.stringify(source).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://unpkg.com/@babel/standalone@7/babel.min.js"></script>
<script type="importmap">{"imports":{"react":"https://esm.sh/react@18.3.1","react/":"https://esm.sh/react@18.3.1/","react-dom":"https://esm.sh/react-dom@18.3.1","react-dom/":"https://esm.sh/react-dom@18.3.1/"}}</script>
</head><body><div id="root"></div>
<script type="module">
try {
  let code = Babel.transform(${src}, { filename: 'artifact.tsx', presets: [['react', { runtime: 'automatic' }], ['typescript', { isTSX: true, allExtensions: true }]] }).code;
  code = code.replace(/(\\bfrom\\s*|\\bimport\\s*\\(?\\s*)(['"])([^'"./][^'"]*)\\2/g, (m, pre, q, spec) =>
    /^react(-dom)?(\\/|$)/.test(spec) ? m : pre + q + 'https://esm.sh/' + spec + '?external=react,react-dom' + q);
  const mod = await import(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
  const App = mod.default || Object.values(mod).find((v) => typeof v === 'function');
  if (!App) throw new Error('the file has no exported component');
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  createRoot(document.getElementById('root')).render(React.createElement(App));
  setTimeout(() => { window.__prReady = true; }, 500);
} catch (e) { window.__prError = String(e && e.message || e); }
</script></body></html>`;
}

function targetUrl() {
  if (/^(https?|file):\/\//i.test(target)) return { url: target, harness: false };
  const file = path.resolve(target);
  if (!fs.existsSync(file)) fail(`file not found: ${target}`);
  if (/\.(jsx|tsx|js|ts)$/i.test(file)) {
    const harness = path.join(outDir, 'harness.html');
    fs.writeFileSync(harness, harnessHtml(fs.readFileSync(file, 'utf8')));
    return { url: pathToFileURL(harness).href, harness: true };
  }
  return { url: pathToFileURL(file).href, harness: false };
}

const variantOf = (v) => ({ width: parseInt(v, 10), dark: v.endsWith('-dark') });
const diffSnap = (before, after) => {
  const res = {};
  for (const [id, props] of Object.entries(after)) {
    for (const [p, val] of Object.entries(props)) if (before[id]?.[p] !== val) (res[id] ||= {})[p] = val;
  }
  return res;
};

function refMap(result) {
  const { sections, elements, measure, variants, hover } = result;
  const seen = (id) => variants.some((v) => measure[v][id]?.visible);
  const lines = [
    '# Reference map', '',
    `Source: ${path.basename(target)} · captured ${result.capturedAt.slice(0, 16).replace('T', ' ')}`,
    `Screen sizes: ${variants.map((v) => v.replace('-dark', ' dark')).join(', ')}`,
    `${Object.keys(elements).length} elements in ${sections.length} sections. Give each built element its id as data-ref="r-###".`,
    'Marks: (hover) = has a hover state, (motion) = animates, (hidden) = not visible at any measured size.',
  ];
  for (const s of sections) {
    const ids = Object.keys(elements).filter((id) => elements[id].section === s.id);
    lines.push('', `## ${s.id} · ${s.name} · ${ids.length} elements${s.hiddenAtLoad ? ' · hidden at load' : ''}`);
    for (const id of ids) {
      const e = elements[id];
      const marks = [hover[id] && '(hover)', result.motion[id] && '(motion)', !seen(id) && '(hidden)'].filter(Boolean).join(' ');
      lines.push(`${'  '.repeat(Math.min(e.depth, 8))}- ${id} ${e.tag}${e.text ? ` "${e.text}"` : ''}${marks ? ` ${marks}` : ''}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  let ref = null;
  if (mode === 'build') {
    try { ref = JSON.parse(fs.readFileSync(path.join(outDir, 'ref.json'), 'utf8')); } catch { fail(`no ref.json in ${out} - run capture with --mode ref first`); }
  }
  const widths = ref ? ref.widths : String(typeof flag('widths') === 'string' ? flag('widths') : '1440,768,390')
    .split(',').map((w) => parseInt(w, 10)).filter((w) => w > 0);
  if (!widths.length) fail('--widths needs at least one number');
  const { url, harness } = targetUrl();

  const browser = await launchBrowser(data);
  try {
    const context = await newContext(browser, url, { viewport: { width: widths[0], height: HEIGHT }, deviceScaleFactor: 1, colorScheme: 'light' });
    await context.addInitScript(prInit);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
    try {
      await page.goto(url, { waitUntil: 'load', timeout: timeoutMs });
    } catch (e) {
      fail(`the page did not load (${e.message.split('\n')[0]})`);
    }
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    if (harness) {
      await page.waitForFunction(() => window.__prReady || window.__prError, null, { timeout: 30000 }).catch(() => {});
      const err = await page.evaluate(() => window.__prError);
      if (err) fail(`the React artifact did not render (${err})`);
    }
    if (mode === 'build' && await looksLikeLogin(page)) {
      fail(`the page shows a login instead of the app (${page.url()}) - run capture --mode login --target "${target}" once`);
    }
    await page.evaluate(() => window.__pr.scrollThrough());

    const info = await page.evaluate((m) => (m === 'ref' ? window.__pr.assignRef() : window.__pr.assignBuild()), mode);
    if (!Object.keys(info.elements).length) {
      fail(mode === 'ref' ? `the artifact rendered nothing${errors.length ? ` (${errors[0]})` : ''}`
        : 'no element on the page has a data-ref attribute - tag the built elements first');
    }
    const motion = await page.evaluate(() => window.__pr.motion());
    const tokenNames = ref ? ref.tokenNames : Object.keys(await page.evaluate(() => window.__pr.tokens()));
    const variants = ref ? ref.variants
      : [...widths.map(String), ...(await page.evaluate(() => window.__pr.hasDark()) ? [`${widths[0]}-dark`] : [])];

    const measure = {};
    const tokens = {};
    for (const v of variants) {
      const { width, dark } = variantOf(v);
      await page.setViewportSize({ width, height: HEIGHT });
      await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
      await page.waitForTimeout(300);
      await page.evaluate(() => window.__pr.settle());
      measure[v] = await page.evaluate(() => window.__pr.measure());
      tokens[v] = await page.evaluate((n) => window.__pr.tokens(n), tokenNames);
      await page.screenshot({ path: path.join(outDir, `${mode}-${v}.png`), fullPage: true });
    }

    // Hover states, at the first (widest) size in light mode.
    await page.setViewportSize({ width: widths[0], height: HEIGHT });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.evaluate(() => window.__pr.settle());
    const hoverIds = ref ? Object.keys(ref.hover).filter((id) => info.elements[id]) : (await page.evaluate(() => window.__pr.hoverTargets())).slice(0, MAX_HOVERS);
    const hover = {};
    for (const id of hoverIds) {
      const pt = await page.evaluate((i) => window.__pr.hoverPoint(i), id);
      if (!pt) continue;
      const before = await page.evaluate((i) => window.__pr.snap(i), id);
      await page.mouse.move(pt.x, pt.y);
      await page.waitForTimeout(pt.wait);
      const after = await page.evaluate((i) => window.__pr.snap(i), id);
      await page.mouse.move(0, 0);
      await page.waitForTimeout(pt.wait);
      // ref keeps what changes; build keeps the full hovered state so compare can show actual values.
      if (ref) hover[id] = after;
      else { const d = diffSnap(before, after); if (Object.keys(d).length) hover[id] = d; }
    }

    const result = {
      version: 1, mode, target, capturedAt: new Date().toISOString(), dataDir: path.resolve(data),
      widths, variants, ...info, tokenNames, tokens, measure, motion, hover, errors: errors.slice(0, 10),
    };
    fs.writeFileSync(path.join(outDir, `${mode}.json`), JSON.stringify(result));
    const sizes = `${variants.length} screen size${variants.length > 1 ? 's' : ''}`;
    if (mode === 'ref') {
      fs.writeFileSync(path.join(outDir, 'ref-map.md'), refMap(result));
      console.log(`✔ captured reference: ${Object.keys(info.elements).length} elements in ${info.sections.length} sections, ${sizes}`
        + ` (${Object.keys(hover).length} hover states, ${Object.keys(motion).length} animated) · ref-map.md`);
    } else {
      const found = Object.keys(ref.elements).filter((id) => info.elements[id]).length;
      const dup = Object.keys(info.duplicates).length;
      console.log(`✔ captured build: ${found} of ${Object.keys(ref.elements).length} reference ids tagged, ${sizes}${dup ? ` · ${dup} ids used more than once` : ''}`);
    }
    if (errors.length) console.log(`⚠ page errors: ${errors.slice(0, 2).join(' | ')}`);
  } finally {
    await browser.close();
  }
}

({ probe, login }[mode] || main)().catch((e) => {
  console.log(`✖ capture failed: ${e instanceof CaptureError ? e.message : e.message.split('\n')[0]}`);
  process.exitCode = 1;
});
