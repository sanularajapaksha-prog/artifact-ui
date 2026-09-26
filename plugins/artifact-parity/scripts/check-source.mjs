#!/usr/bin/env node
// Decides whether a file is the artifact's REAL source (markup + styles), not a
// WebFetch summary, a claude.ai login/app-shell page, or an empty download.
// Also reports useful facts (fonts, scripts, keyframes), warns about garbled
// characters that an exact copy would otherwise reproduce, and names techniques
// the parity measurement cannot verify (GSAP, scroll-driven motion, canvas...).
//
// Usage: node check-source.mjs --file <path>
// Exit codes: 0 real source, 1 not real source (reason printed), 2 usage error.

import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const i = argv.indexOf('--file');
const file = i >= 0 ? argv[i + 1] : undefined;
if (!file) { console.error('check-source: --file <path> is required'); process.exit(2); }

const bad = (reason) => { console.log(`✖ not real source: ${reason}`); process.exit(1); };
if (!fs.existsSync(file)) bad(`file not found: ${file}`);

const buf = fs.readFileSync(file);
const kb = (buf.length / 1024).toFixed(buf.length < 10240 ? 1 : 0);
if (buf.length < 1024) bad(`only ${buf.length} bytes - too small to be a real UI prototype`);

const text = buf.toString('utf8').replace(/^\uFEFF/, '');
const lines = text.split(/\r?\n/);
const ext = path.extname(file).toLowerCase();
const count = (re) => (text.match(re) || []).length;

// --- claude.ai pages that are not the artifact itself ---
if (/<title>\s*Just a moment\.\.\.\s*<\/title>/i.test(text) || /cf-browser-verification|challenge-platform/i.test(text)) {
  bad('this is a Cloudflare bot-check page, not the artifact');
}
const looksLikeClaudeShell = /<title>\s*Claude\s*<\/title>/i.test(text)
  && (/__NEXT_DATA__|_next\/static|<div id="root">\s*<\/div>/i.test(text) || /log in|sign in|continue with google/i.test(text));
if (looksLikeClaudeShell) bad('this is the claude.ai app page (login or empty shell), not the artifact inside it');

// --- markup and style signals ---
const tags = count(/<[a-zA-Z][a-zA-Z0-9-]*[\s>/]/g);
const styleSignals = count(/<style[\s>]/gi) + count(/\sclass(Name)?\s*=/g) + count(/\sstyle\s*=/g);
const isJsx = ext === '.jsx' || ext === '.tsx' || /export\s+default|from\s+['"]react['"]/.test(text);

if (isJsx) {
  if (!/className\s*=|style=\{\{/.test(text) || tags < 10) bad('React file without markup or styles - looks like a stub, not the prototype');
} else {
  if (tags < 15) bad(`only ${tags} HTML tags - looks like a text summary, not source`);
  if (styleSignals < 5) bad('almost no CSS classes or styles - looks like a summary or plain document, not the prototype');
}
const firstReal = lines.find((l) => l.trim()) || '';
if (!isJsx && !/^\s*(<|<!--)/.test(firstReal) && tags < 60) {
  bad('starts with prose instead of markup - looks like a summary of the page');
}

// --- facts for the build ---
const fonts = new Set();
for (const m of text.matchAll(/fonts\.googleapis\.com\/css2?\?([^"'\s)]+)/g)) {
  for (const f of m[1].replace(/&amp;/g, '&').split('&')) if (f.startsWith('family=')) fonts.add(decodeURIComponent(f.slice(7).split(':')[0]).replace(/\+/g, ' '));
}
const keyframes = count(/@keyframes\s+[\w-]+/g);
const scripts = count(/<script[\s>]/gi);
const externalScripts = [...text.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]);
const imports = [...text.matchAll(/from\s+['"]([^'"./][^'"]*)['"]/g)].map((m) => m[1]);

// --- garbled text (UTF-8 decoded twice) that an exact copy would reproduce ---
const garbledRe = /Ã[\u0080-\u00BF]|Â[\u0080-\u00BF]|â€[\u0080-\u00BF™œ�]/g;
const garbled = [];
lines.forEach((l, n) => { for (const m of l.matchAll(garbledRe)) garbled.push(`line ${n + 1}: "${m[0]}"`); });
const replacement = count(/\uFFFD/g);

// --- techniques the parity measurement can't verify (capture sees CSS/WAAPI motion at scroll 0 only) ---
const unmeasured = [
  [/\bgsap\b|ScrollTrigger/, 'GSAP tweens'],
  [/requestAnimationFrame/, 'requestAnimationFrame motion'],
  [/animation-timeline|\bview\(\s*\)|\bscroll\(\s*\)/, 'scroll-driven animations (only the top-of-page state)'],
  [/IntersectionObserver/, 'scroll reveals (only after one scroll pass)'],
  [/scroll-behavior\s*:\s*smooth/, 'scroll-behavior: smooth'],
  [/light-dark\(/, 'light-dark() colors (dark mode not detected)'],
  [/<animate(Transform|Motion)?[\s>]/, 'SVG SMIL animation'],
  [/<canvas[\s>]|WebGLRenderer|\bthree(\.module)?(\.min)?\.js/, 'canvas/WebGL (box only)'],
  [/<video[\s>]/, 'video (box only)'],
  [/hold-loader/, 'the loading screen (removed on load, before the check)'],
].filter(([re]) => re.test(text)).map(([, what]) => what);
// Google Fonts sheets only hold @font-face, which capture never needs to read.
const unreadableSheets = [...text.matchAll(/<link\b[^>]*rel=["']?stylesheet[^>]*>/gi)]
  .filter((m) => !/crossorigin/i.test(m[0]) && /href=["']?https?:/i.test(m[0]) && !/fonts\.googleapis\.com/i.test(m[0])).length;
if (unreadableSheets) unmeasured.push(`${unreadableSheets} stylesheet link${unreadableSheets > 1 ? 's' : ''} without crossorigin (rules unreadable)`);

const kind = isJsx ? 'React component' : 'HTML';
const parts = [`${kind}, ${kb} KB, ${lines.length} lines`];
if (fonts.size) parts.push(`fonts: ${[...fonts].join(', ')}`);
if (keyframes) parts.push(`${keyframes} keyframes`);
if (scripts) parts.push(`${scripts} script${scripts > 1 ? 's' : ''}${externalScripts.length ? ` (${externalScripts.length} external)` : ''}`);
if (imports.length) parts.push(`imports: ${[...new Set(imports)].slice(0, 6).join(', ')}`);
console.log(`✔ real source: ${parts.join(' · ')}`);
if (garbled.length) {
  console.log(`⚠ ${garbled.length} garbled character${garbled.length > 1 ? 's' : ''} in the source (${garbled.slice(0, 3).join(', ')}) - an exact copy would reproduce them`);
}
if (replacement) console.log(`⚠ ${replacement} unreadable character${replacement > 1 ? 's' : ''} (U+FFFD) in the source`);
if (unmeasured.length) console.log(`⚠ not measured by the parity check: ${unmeasured.join(', ')}`);
