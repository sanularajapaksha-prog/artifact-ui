#!/usr/bin/env node
// Status bar for artifact-parity. Claude Code runs this command and pipes
// session JSON on stdin; whatever this prints becomes the bottom bar.
// It shows the current run's stage from <project>/design-ref/.progress.json
// and prints nothing when no run is active, so it stays out of the way.
// Self-contained on purpose: a copy lives in the plugin data folder so the
// settings.json path stays valid across plugin updates.

import fs from 'node:fs';
import path from 'node:path';

const SHOW_AFTER_END_MS = 10 * 60 * 1000;   // keep "done"/"stopped" visible for 10 minutes
const ABANDONED_MS = 2 * 60 * 60 * 1000;    // hide runs with no update for 2 hours
const ASCII = process.env.PARITY_ASCII === '1';
const G = ASCII ? { run: '>', ok: 'OK', fail: 'X', wait: '?', dot: '|' } : { run: '▸', ok: '✔', fail: '✖', wait: '❓', dot: '·' };

function readStdinJson() {
  if (process.stdin.isTTY) return {}; // run by hand in a terminal: don't wait for input
  try {
    const raw = fs.readFileSync(0, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function findStateFile(startDir) {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 12; i++) {
    const candidate = path.join(dir, 'design-ref', '.progress.json');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function fmtDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`;
}

function render() {
  const session = readStdinJson();
  const cwd = session?.workspace?.current_dir || session?.cwd || process.cwd();
  const file = findStateFile(cwd);
  if (!file) return '';
  let s;
  try { s = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return ''; }
  if (!s || typeof s !== 'object' || !s.stages) return '';

  const now = Date.now();
  const updated = Date.parse(s.updatedAt || s.startedAt || '');
  const age = Number.isFinite(updated) ? now - updated : Infinity;
  const ended = s.finished || s.failed;
  if (ended && age > SHOW_AFTER_END_MS) return '';
  if (!ended && age > ABANDONED_MS) return '';

  const total = s.total || Object.keys(s.stages).length;
  const screen = s.screen || 'screen pending';
  const elapsed = fmtDuration((ended ? updated : now) - Date.parse(s.startedAt));
  const parts = [];
  if (s.finished) {
    parts.push(`${G.ok} parity`, screen, 'done');
    if (s.score) parts.push(s.score);
  } else if (s.failed) {
    parts.push(`${G.fail} parity`, screen, `stopped at ${s.current}/${total} ${s.currentName || ''}`.trim());
  } else if (s.waiting) {
    parts.push(`${G.wait} parity`, screen, `${s.current}/${total} ${s.currentName || ''}`.trim(), 'waiting for you');
  } else {
    const justDone = s.stages?.[s.current]?.status === 'done' ? ` ${G.ok}` : '';
    parts.push(`${G.run} parity`, screen, `${s.current}/${total} ${s.currentName || ''}${justDone}`.trim());
    if (s.sub) parts.push(s.sub);
    if (s.score) parts.push(s.score);
  }
  if (elapsed) parts.push(elapsed);
  return parts.join(` ${G.dot} `);
}

let out = '';
try { out = render(); } catch { out = ''; }
process.stdout.write(out);
