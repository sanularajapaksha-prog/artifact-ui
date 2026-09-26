#!/usr/bin/env node
// Noise check for capture.mjs: captures a page twice in ref mode and compares the two
// captures, the second standing in for the build. Every row it reports is nondeterminism
// that no build could ever fix, so a clean page prints "0 rows".
//
// Usage: node fixtures/capture/noise.mjs [--scripts <dir>] [--data <dir>] <page.html[?query]> ...
//   pages are paths relative to this folder (or absolute); a ?query is passed to the page
//   --scripts  the plugin's scripts folder (default: this repo's plugins/artifact-parity/scripts)
//   --data     the plugin data folder with Playwright installed (default: $CLAUDE_PLUGIN_DATA,
//              then ~/.claude/plugins/data/artifact-parity-artifact-tools)
// Exit codes: 0 every page captured, 1 a capture or compare failed, 2 usage error.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args.splice(i, 2)[1] : fallback; };
const scripts = path.resolve(opt('scripts', path.join(HERE, '..', '..', 'plugins', 'artifact-parity', 'scripts')));
const data = path.resolve(opt('data', process.env.CLAUDE_PLUGIN_DATA
  || path.join(os.homedir(), '.claude', 'plugins', 'data', 'artifact-parity-artifact-tools')));
if (!args.length) { console.error('usage: noise.mjs [--scripts <dir>] [--data <dir>] <page.html[?query]> ...'); process.exit(2); }

let failed = false;
for (const page of args) {
  const [file, query] = page.split('?');
  const url = `${pathToFileURL(path.resolve(HERE, file)).href}${query ? `?${query}` : ''}`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noise-'));
  const run = (script, extra) => spawnSync(process.execPath, [path.join(scripts, script), ...extra], { encoding: 'utf8' });
  const outs = ['a', 'b'].map((n) => path.join(tmp, n));
  const caps = outs.map((out) => run('capture.mjs', ['--data', data, '--mode', 'ref', '--target', url, '--out', out]));
  if (caps.some((c) => c.status !== 0)) {
    failed = true;
    console.log(`${page}: capture failed - ${(caps.find((c) => c.status !== 0).stdout || '').trim().split('\n').pop()}`);
    continue;
  }
  fs.copyFileSync(path.join(outs[1], 'ref.json'), path.join(outs[0], 'build.json'));
  const cmp = run('compare.mjs', ['--dir', outs[0]]);
  let result = null;
  try { result = JSON.parse(fs.readFileSync(path.join(outs[0], 'result.json'), 'utf8')); } catch { /* reported below */ }
  if (cmp.status !== 0 || !result) { failed = true; console.log(`${page}: compare failed - ${(cmp.stdout + cmp.stderr).trim().split('\n').pop()}`); continue; }
  const rows = fs.readFileSync(path.join(outs[0], 'report.md'), 'utf8').split('\n').filter((l) => /^\| r-/.test(l) || /^- r-/.test(l));
  console.log(`${page}: ${result.rows} rows${result.stateRows ? ` + ${result.stateRows} state rows` : ''}`);
  for (const r of rows.slice(0, 8)) console.log(`    ${r}`);
  fs.rmSync(tmp, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
