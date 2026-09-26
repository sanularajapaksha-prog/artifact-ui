#!/usr/bin/env node
// Wraps a design fragment (what the Artifact tool publishes: no doctype, head or body) in the same
// document skeleton the artifact viewer serves it in, so the browser check and the build see the
// page exactly as viewers do. The skeleton below is copied from a published artifact read back with
// the Artifact tool (Claude Code 2.1.199); if a published page ever looks different from its check,
// read the artifact back and compare the <head>.
//
// Usage: node wrap-page.mjs --in <design.html> --out <design.page.html>
// Exit codes: 0 written, 1 input missing or already a full document, 2 usage error.

import fs from 'node:fs';

const argv = process.argv.slice(2);
const arg = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
const input = arg('in');
const output = arg('out');
if (!input || !output) { console.error('wrap-page: --in <fragment.html> and --out <page.html> are required'); process.exit(2); }

let body;
try { body = fs.readFileSync(input, 'utf8').replace(/^﻿/, ''); } catch { console.log(`✖ wrap-page: cannot read ${input}`); process.exit(1); }
if (/<!doctype|<html[\s>]|<body[\s>]/i.test(body)) {
  console.log('✖ wrap-page: the design already has its own <!doctype>, <html> or <body>; the Artifact tool adds those, so remove them');
  process.exit(1);
}

const HEAD = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">'
  + '<style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
  + 'html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#faf9f5;color:#141413}'
  + 'img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>\n';

fs.writeFileSync(output, `${HEAD}${body}\n</body></html>\n`);
console.log(`✔ wrote ${output}`);
