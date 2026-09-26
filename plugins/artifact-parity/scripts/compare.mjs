#!/usr/bin/env node
// Compares build.json against ref.json (both written by capture.mjs) and
// writes report.md: one row per difference, ordered missing -> fonts -> theme
// and tokens -> typography -> box -> layout -> states -> motion. Prints the
// score. From pass 3 on it also writes reference | build | diff crops.
//
// Usage: compare.mjs --dir <design-ref/screen> [--scope <scope.json>] [--pass <n>] [--data <plugin data dir>]
// Colors must match exactly; px values within 0.5px.
// Exit codes: 0 compared (clean or not), 1 failed (reason printed), 2 usage error.

import fs from 'node:fs';
import path from 'node:path';
import { loadModule } from './lib/deps.mjs';

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  return v !== undefined && !v.startsWith('--') ? v : true;
};
const dir = flag('dir');
if (typeof dir !== 'string') { console.error('compare: --dir <design-ref/screen folder> is required'); process.exit(2); }
const pass = Number(flag('pass')) || 1;
const PX_TOL = 0.5;
const MAX_ROWS_PER_CATEGORY = 80;
const MAX_CROPS = 20;

class CompareError extends Error {}
const fail = (msg) => { throw new CompareError(msg); };
const readJson = (file, what) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fail(`${what} not found or unreadable: ${file}`); }
};

const CATS = ['missing', 'fonts', 'theme and tokens', 'typography', 'box', 'layout', 'states', 'motion'];
const CAT_OF = {
  fontFamily: 'fonts', fontWeight: 'fonts', fontStyle: 'fonts', fontLoaded: 'fonts',
  fontSize: 'typography', lineHeight: 'typography', letterSpacing: 'typography', textTransform: 'typography',
  textAlign: 'typography', textDecorationLine: 'typography', color: 'typography', text: 'typography',
  display: 'layout', position: 'layout', flexDirection: 'layout', flexWrap: 'layout', justifyContent: 'layout',
  alignItems: 'layout', rowGap: 'layout', columnGap: 'layout', gridTemplateColumns: 'layout',
  cursor: 'states',
  transitionProperty: 'motion', transitionDuration: 'motion', transitionTimingFunction: 'motion', transitionDelay: 'motion',
  animationDuration: 'motion', animationTimingFunction: 'motion', animationDelay: 'motion', animationIterationCount: 'motion',
};
const catOf = (p) => CAT_OF[p] || 'box';

const NUM = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?(px)?/gi;
function same(prop, a, b) {
  if (prop === 'letterSpacing') { a = a === 'normal' ? '0px' : a; b = b === 'normal' ? '0px' : b; }
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= PX_TOL;
  const sa = String(a); const sb = String(b);
  if (sa.replace(NUM, '#') !== sb.replace(NUM, '#')) return false;
  const na = [...sa.matchAll(NUM)]; const nb = [...sb.matchAll(NUM)];
  return na.every((m, i) => Math.abs(parseFloat(m[0]) - parseFloat(nb[i][0])) <= (m[1] ? PX_TOL : 1e-3));
}

async function main() {
  const ref = readJson(path.join(dir, 'ref.json'), 'ref.json (run capture --mode ref)');
  const build = readJson(path.join(dir, 'build.json'), 'build.json (run capture --mode build)');
  const scopeFile = flag('scope');
  const scope = typeof scopeFile === 'string' ? readJson(scopeFile, 'scope file') : { sections: 'all' };
  const all = !Array.isArray(scope.sections);
  if (!all) {
    const known = new Set(ref.sections.map((s) => s.id));
    const unknown = scope.sections.filter((s) => !known.has(s));
    if (unknown.length) fail(`scope names unknown sections ${unknown.join(', ')} - valid: ${[...known].join(', ')}`);
  }
  const inScope = (id) => all || scope.sections.includes(ref.elements[id]?.section);
  const rootOf = Object.fromEntries(ref.sections.map((s) => [s.id, s.root]));
  const ids = Object.keys(ref.elements).filter(inScope);

  let checks = 0; let passed = 0;
  const rows = new Map();
  const check = (ok, cat, id, prop, exp, act, size) => {
    checks++;
    if (ok) { passed++; return; }
    const key = `${cat}|${id}|${prop}|${exp}|${act}`;
    if (!rows.has(key)) rows.set(key, { cat, id, prop, exp, act, sizes: new Set() });
    rows.get(key).sizes.add(size);
  };

  for (const id of ids) {
    const n = build.duplicates?.[id];
    if (n) check(false, 'missing', id, 'data-ref', 'used once', `used ${n} times (only the first is measured)`, '-');
  }

  for (const v of ref.variants) {
    const R = ref.measure[v] || {};
    const B = build.measure?.[v] || {};
    for (const id of ids) {
      const r = R[id];
      if (!r?.visible) continue;
      const b = B[id];
      const present = b?.visible;
      check(present, 'missing', id, 'element', 'present',
        build.elements?.[id] ? 'hidden at this size' : `no element with data-ref="${id}"`, v);
      if (!present) continue;
      for (const [p, exp] of Object.entries(r.s)) {
        const side = p.match(/^border(Top|Right|Bottom|Left)Color$/);
        if (side && r.s[`border${side[1]}Width`] === '0px') continue;
        check(same(p, exp, b.s[p]), catOf(p), id, p, exp, b.s[p] ?? '(none)', v);
      }
      const rootId = rootOf[ref.elements[id].section];
      const r0 = R[rootId]; const b0 = B[rootId];
      if (id !== rootId && r0?.visible && b0?.visible) {
        const [ex, ey] = [r.r.x - r0.r.x, r.r.y - r0.r.y].map((n) => +n.toFixed(2));
        const [ax, ay] = [b.r.x - b0.r.x, b.r.y - b0.r.y].map((n) => +n.toFixed(2));
        check(same('x', ex, ax), 'layout', id, `x in section (from ${rootId})`, ex, ax, v);
        check(same('y', ey, ay), 'layout', id, `y in section (from ${rootId})`, ey, ay, v);
      }
    }
    for (const name of ref.tokenNames || []) {
      const exp = ref.tokens[v]?.[name] ?? '';
      const act = build.tokens?.[v]?.[name] || '(not defined)';
      check(same(name, exp, act), 'theme and tokens', 'theme', name, exp, act, v);
    }
  }

  const hoverSize = String(ref.widths[0]);
  for (const [hid, changes] of Object.entries(ref.hover || {})) {
    if (!inScope(hid)) continue;
    const bh = build.hover?.[hid];
    for (const [eid, props] of Object.entries(changes)) {
      for (const [p, exp] of Object.entries(props)) {
        const act = bh ? (bh[eid]?.[p] ?? '(element not found)') : '(not hovered - element missing or covered)';
        check(same(p, exp, act), 'states', hid, eid === hid ? `hover: ${p}` : `hover: ${p} on ${eid}`, exp, act, hoverSize);
      }
    }
  }

  const FIELDS = ['keyframes', 'duration', 'delay', 'easing', 'iterations', 'direction', 'fill'];
  const iter = (n) => (n == null ? 'infinite' : n);
  for (const [id, list] of Object.entries(ref.motion || {})) {
    if (!inScope(id)) continue;
    const pool = [...(build.motion?.[id] || [])];
    list.forEach((ra, i) => {
      let j = pool.findIndex((b) => b.keyframes === ra.keyframes);
      if (j < 0) j = pool.length ? 0 : -1;
      const label = `animation ${i + 1}`;
      if (j < 0) {
        check(false, 'motion', id, label, `${ra.duration}ms, delay ${ra.delay}ms, ${iter(ra.iterations)}x`, 'none', '-');
        return;
      }
      const ba = pool.splice(j, 1)[0];
      for (const f of FIELDS) {
        const [e, a] = f === 'iterations' ? [iter(ra[f]), iter(ba[f])] : [ra[f], ba[f]];
        check(same(f, e, a), 'motion', id, `${label} ${f}`, e, a, '-');
      }
    });
  }

  const measured = ids.some((id) => ref.variants.some((v) => ref.measure[v]?.[id]?.visible));
  if (!measured) fail('nothing in scope is visible in the artifact at load (for example a closed tab), so nothing could be measured');

  const list = [...rows.values()].sort((a, b) => CATS.indexOf(a.cat) - CATS.indexOf(b.cat) || a.id.localeCompare(b.id));
  const clean = list.length === 0;
  let pct = Math.floor((passed / checks) * 100);
  if (!clean && pct === 100) pct = 99;
  const score = clean ? `100% CLEAN (${passed}/${checks})` : `${pct}% (${passed}/${checks})`;

  // ---------- crops (pass 3+) ----------
  const crops = {};
  if (pass >= 3 && !clean) {
    const dataDir = typeof flag('data') === 'string' ? flag('data') : ref.dataDir;
    const { PNG } = await loadModule(dataDir, 'pngjs');
    const pixelmatch = await loadModule(dataDir, 'pixelmatch');
    const cropDir = path.join(dir, 'crops');
    fs.rmSync(cropDir, { recursive: true, force: true });
    fs.mkdirSync(cropDir, { recursive: true });
    const pngs = {};
    const png = (side, v) => {
      const file = path.join(dir, `${side}-${v}.png`);
      if (!(file in pngs)) pngs[file] = fs.existsSync(file) ? PNG.sync.read(fs.readFileSync(file)) : null;
      return pngs[file];
    };
    const cut = (img, rect, w, h) => {
      const outImg = new PNG({ width: w, height: h });
      outImg.data.fill(255);
      const x0 = Math.max(0, Math.round(rect.x) - 8); const y0 = Math.max(0, Math.round(rect.y) - 8);
      for (let y = 0; y < h && y0 + y < img.height; y++) {
        for (let x = 0; x < w && x0 + x < img.width; x++) {
          const s = ((y0 + y) * img.width + (x0 + x)) * 4; const d = (y * w + x) * 4;
          img.data.copy(outImg.data, d, s, s + 4);
        }
      }
      return outImg;
    };
    for (const row of list) {
      if (Object.keys(crops).length >= MAX_CROPS) break;
      if (row.id === 'theme' || crops[row.id]) continue;
      const v = [...row.sizes].find((s) => ref.variants.includes(s)) || String(ref.widths[0]);
      const r = ref.measure[v]?.[row.id]; const b = build.measure?.[v]?.[row.id];
      const ri = png('ref', v); const bi = png('build', v);
      if (!r?.visible || !b?.visible || !ri || !bi) continue;
      const w = Math.min(1200, Math.ceil(Math.max(r.r.w, b.r.w)) + 16);
      const h = Math.min(1200, Math.ceil(Math.max(r.r.h, b.r.h)) + 16);
      const a = cut(ri, r.r, w, h); const c = cut(bi, b.r, w, h);
      const diff = new PNG({ width: w, height: h });
      pixelmatch(a.data, c.data, diff.data, w, h, { threshold: 0.1 });
      const sheet = new PNG({ width: w * 3 + 16, height: h });
      sheet.data.fill(255);
      [a, c, diff].forEach((img, k) => PNG.bitblt(img, sheet, 0, 0, w, h, k * (w + 8), 0));
      const name = `${row.id}-${v}.png`;
      fs.writeFileSync(path.join(cropDir, name), PNG.sync.write(sheet));
      crops[row.id] = `crops/${name}`;
    }
  }

  // ---------- report ----------
  const esc = (s) => (typeof s === 'number' ? String(+s.toFixed(2)) : String(s)).replace(/\|/g, '\\|').replace(/\s+/g, ' ').slice(0, 90);
  const el = (id) => {
    const e = ref.elements[id];
    return e ? `${id} ${e.tag}${e.text ? ` "${e.text.slice(0, 30)}"` : ''}` : id;
  };
  const sizes = (set) => (set.size === ref.variants.length ? 'all' : [...set].join(', ').replace(/-dark/g, ' dark'));
  const scopeText = all ? 'all sections' : scope.sections.map((s) => `${s} ${ref.sections.find((x) => x.id === s)?.name || ''}`.trim()).join(', ');
  const extra = Object.keys(build.elements || {}).filter((id) => !ref.elements[id]);
  const lines = [
    `# Parity report - pass ${pass}`, '',
    `Score: ${score}${clean ? '' : ` · ${list.length} rows to fix`}`,
    `Scope: ${scopeText}${scope.brief ? ` ("${scope.brief}")` : ''}`,
    `Screen sizes: ${ref.variants.map((v) => v.replace('-dark', ' dark')).join(', ')} · hover measured at ${hoverSize}`,
    'Rules: colors exact, px values within 0.5px, x/y measured from the section root.',
  ];
  if (extra.length) lines.push(`Note: the build has data-ref ids the artifact doesn't: ${extra.slice(0, 10).join(', ')}${extra.length > 10 ? ' ...' : ''}`);
  if (clean) lines.push('', 'CLEAN - no differences.');
  for (const cat of CATS) {
    const catRows = list.filter((r) => r.cat === cat);
    if (!catRows.length) continue;
    lines.push('', `## ${cat} (${catRows.length})`, '', '| element | property | expected | actual | sizes |', '|---|---|---|---|---|');
    for (const r of catRows.slice(0, MAX_ROWS_PER_CATEGORY)) {
      lines.push(`| ${esc(r.id === 'theme' ? 'theme' : el(r.id))} | ${esc(r.prop)} | ${esc(r.exp)} | ${esc(r.act)} | ${sizes(r.sizes)}${crops[r.id] ? ` · ${crops[r.id]}` : ''} |`);
    }
    if (catRows.length > MAX_ROWS_PER_CATEGORY) lines.push(`| ... ${catRows.length - MAX_ROWS_PER_CATEGORY} more rows in this category | | | | |`);
  }
  fs.writeFileSync(path.join(dir, 'report.md'), `${lines.join('\n')}\n`);

  console.log(`score: ${score}`);
  console.log(clean ? 'CLEAN · 0 differences' : `${list.length} rows to fix · ${path.join(dir, 'report.md')}${Object.keys(crops).length ? ` · ${Object.keys(crops).length} crops` : ''}`);
}

main().catch((e) => {
  console.log(`✖ compare failed: ${e instanceof CompareError ? e.message : e.message.split('\n')[0]}`);
  process.exitCode = 1;
});
