#!/usr/bin/env node
// Keeps a build inside the frontend app folder. --save snapshots the git state
// before building (every dirty file with a content hash, so the user's own
// uncommitted work is not blamed on the run); --check lists files changed
// during the run outside the app folder; --revert undoes those that were clean
// before the run (files that already had the user's changes are never touched).
// design-ref/ folders are the plugin's own output and always allowed.
//
// Usage: scope-guard.mjs --save|--check|--revert --app <app folder> --out <design-ref/screen>
// Exit codes: 0 ok (or not a git repo), 1 changes outside the app found (--check), 2 usage error.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  return v !== undefined && !v.startsWith('--') ? v : true;
};
const action = ['save', 'check', 'revert'].find((a) => flag(a) === true);
const app = flag('app');
const out = flag('out');
if (!action || typeof app !== 'string' || typeof out !== 'string') {
  console.error('scope-guard: --save|--check|--revert, --app <folder> and --out <design-ref/screen> are required');
  process.exit(2);
}
const appDir = path.resolve(app);
const baselineFile = path.join(path.resolve(out), '.scope-baseline.json');

const git = (args) => {
  const r = spawnSync('git', ['-C', appDir, ...args], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
};
const top = git(['rev-parse', '--show-toplevel'])?.trim();
if (!top) { console.log('· scope guard: the app is not in a git repo - changes outside it cannot be checked'); process.exit(0); }
const root = path.resolve(top);

function dirtyFiles() {
  const raw = git(['status', '--porcelain=v1', '-z', '--untracked-files=all']) || '';
  const files = {};
  const parts = raw.split('\0');
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i];
    if (!entry) continue;
    const code = entry.slice(0, 2);
    const file = entry.slice(3);
    if (code[0] === 'R' || code[0] === 'C') i++; // rename/copy: the next field is the old path
    const full = path.join(root, file);
    let hash = 'deleted';
    try { hash = crypto.createHash('sha1').update(fs.readFileSync(full)).digest('hex'); } catch { /* deleted or a folder */ }
    files[file] = { code, hash };
  }
  return files;
}

const inside = (file, dir) => { const rel = path.relative(dir, path.join(root, file)); return rel && !rel.startsWith('..') && !path.isAbsolute(rel); };
const allowed = (file) => inside(file, appDir) || file.split(/[\\/]/).includes('design-ref');

if (action === 'save') {
  fs.mkdirSync(path.dirname(baselineFile), { recursive: true });
  const files = dirtyFiles();
  fs.writeFileSync(baselineFile, JSON.stringify({ savedAt: new Date().toISOString(), root, appDir, files }, null, 2));
  console.log(`✔ scope guard: baseline saved (${Object.keys(files).length} files already had changes before this run)`);
  process.exit(0);
}

let base;
try { base = JSON.parse(fs.readFileSync(baselineFile, 'utf8')); } catch { console.log(`✖ scope guard: no baseline in ${out} - run --save before building`); process.exit(2); }
const now = dirtyFiles();
const changed = Object.entries(now)
  .filter(([f, s]) => !allowed(f) && (!base.files[f] || base.files[f].hash !== s.hash))
  .map(([f, s]) => ({ file: f, untracked: s.code === '??', wasClean: !base.files[f] }));
// Files the user had changed before but that are back to clean now were reverted by the run.
for (const f of Object.keys(base.files)) if (!now[f] && !allowed(f)) changed.push({ file: f, untracked: false, wasClean: false });

if (action === 'check') {
  const insideCount = Object.keys(now).filter((f) => inside(f, appDir) && (!base.files[f] || base.files[f].hash !== now[f].hash)).length;
  if (!changed.length) {
    console.log(`✔ scope guard: only frontend files changed (${insideCount} in ${path.relative(root, appDir) || '.'})`);
    process.exit(0);
  }
  console.log(`✖ scope guard: ${changed.length} file(s) changed outside the frontend app during this run:`);
  for (const c of changed) {
    console.log(`  - ${c.file} ${c.wasClean ? (c.untracked ? '(new file - can be removed)' : '(was clean - can be reverted)') : '(already had your changes before this run - fix by hand)'}`);
  }
  process.exit(1);
}

// --revert: only files that were clean before the run.
let done = 0;
for (const c of changed.filter((x) => x.wasClean)) {
  if (c.untracked) fs.rmSync(path.join(root, c.file), { force: true });
  else spawnSync('git', ['-C', root, 'checkout', '--', c.file], { windowsHide: true });
  done++;
}
const byHand = changed.filter((x) => !x.wasClean);
console.log(`✔ scope guard: reverted ${done} file(s)${byHand.length ? ` · ${byHand.length} left for you to fix by hand: ${byHand.map((x) => x.file).join(', ')}` : ''}`);
