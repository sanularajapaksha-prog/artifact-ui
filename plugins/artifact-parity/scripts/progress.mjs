#!/usr/bin/env node
// Progress tracker for artifact-parity runs.
//
// Every call prints ONE fixed-format line (the progress update the user sees),
// keeps live state in <project>/design-ref/.progress.json (read by the status
// bar) and appends a timestamped line to <project>/design-ref/progress.md.
//
// Usage (run from the project root, or pass --project <dir>):
//   progress.mjs preflight --plugin-root <dir> [--data <dir>] [--screen <name>] [--source <link>]
//   progress.mjs start <stage> [--note <text>]
//   progress.mjs sub   <stage> --note <text>          (detail while a stage runs)
//   progress.mjs done  <stage> [--note <text>] [--score <text>]
//   progress.mjs done  <stage> --from-report <design-ref/screen> [--note <extra>]
//                      (score and row count come from compare's result.json, never from a summary)
//   progress.mjs skip  <stage> [--note <text>]
//   progress.mjs fail  <stage> --note <text>
//   progress.mjs wait  <stage> --note <text>          (waiting for the user's answer)
//   progress.mjs set   [--screen <name>] [--source <link>]
//   progress.mjs show
// Exit codes: 0 ok, 1 preflight failed, 2 usage error.
// Set PARITY_ASCII=1 for plain ASCII output on terminals without Unicode.

import fs from 'node:fs';
import path from 'node:path';

const STAGES = [
  'Preflight', 'Get source', 'Understand project', 'Pick skills', 'Capture reference',
  'Pass 1 build', 'Pass 2 fix', 'Pass 3 fix', 'Finish',
];
const TOTAL = STAGES.length;
const REQUIRED_SCRIPTS = [
  'setup.mjs', 'fetch-public.mjs', 'check-source.mjs', 'detect-project.mjs', 'scope-guard.mjs', 'capture.mjs', 'compare.mjs',
  'list-skills.mjs', 'progress.mjs', 'statusline.mjs',
];
const ASCII = process.env.PARITY_ASCII === '1';
const G = ASCII
  ? { bar: '==', ok: 'OK', fail: 'FAILED', run: '...', skip: 'SKIPPED', wait: '? waiting for you', sep: '-', dot: '|' }
  : { bar: '━━', ok: '✔', fail: '✖ failed', run: '…', skip: '↷ skipped', wait: '❓ waiting for you', sep: '—', dot: '·' };

// ---------- arguments ----------
const argv = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) { flags[a.slice(2)] = next; i++; }
    else flags[a.slice(2)] = true;
  } else positional.push(a);
}
const command = positional[0];

function usage(msg) {
  if (msg) console.error(`progress: ${msg}`);
  console.error('usage: progress.mjs <preflight|start|sub|done|skip|fail|wait|set|show> [stage] [--note ...] [--score ...]');
  process.exit(2);
}

const projectDir = path.resolve(typeof flags.project === 'string' ? flags.project : '.');
const refDir = path.join(projectDir, 'design-ref');
const statePath = path.join(refDir, '.progress.json');
const logPath = path.join(refDir, 'progress.md');

// ---------- helpers ----------
const nowIso = () => new Date().toISOString();
const clock = (d = new Date()) => d.toTimeString().slice(0, 8);

function fmtDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

function readState() {
  try { return JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { return null; }
}

function writeState(state) {
  fs.mkdirSync(refDir, { recursive: true });
  state.updatedAt = nowIso();
  const tmp = `${statePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, statePath); // atomic replace, so the status bar never reads half a file
}

function appendLog(text) {
  fs.mkdirSync(refDir, { recursive: true });
  fs.appendFileSync(logPath, text);
}

function newState(extra = {}) {
  const stages = {};
  STAGES.forEach((name, i) => { stages[i + 1] = { name, status: 'pending' }; });
  return {
    version: 1, total: TOTAL, runId: nowIso(), startedAt: nowIso(),
    screen: extra.screen || '', source: extra.source || '',
    current: 1, currentName: STAGES[0], sub: '', score: '',
    finished: false, failed: false, waiting: '', lastLine: '', stages,
  };
}

function startRun(extra) {
  const state = newState(extra);
  const header = `\n## Run ${new Date().toLocaleString()} ${G.sep} ${state.screen || 'screen pending'}\n`
    + (state.source ? `Source: ${state.source}\n` : '') + '\n';
  appendLog(header);
  return state;
}

function stageNumber(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > TOTAL) usage(`stage must be a number from 1 to ${TOTAL}, got "${raw ?? ''}"`);
  return n;
}

function label(n) { return `${G.bar} [${n}/${TOTAL}] ${STAGES[n - 1]}`; }

function emit(state, line) {
  state.lastLine = line;
  writeState(state);
  appendLog(`- ${clock()} ${line}\n`);
  console.log(line);
}

function details(...parts) {
  const kept = parts.filter((p) => typeof p === 'string' && p.trim());
  return kept.length ? ` ${G.sep} ${kept.join(` ${G.dot} `)}` : '';
}

function ensureState() {
  let state = readState();
  if (!state) state = startRun({}); // tolerate a missing preflight rather than crash
  return state;
}

function markStart(state, n, note) {
  state.waiting = '';
  const st = state.stages[n];
  st.status = 'running';
  st.startedAt = nowIso();
  delete st.endedAt;
  state.current = n;
  state.currentName = STAGES[n - 1];
  state.sub = '';
  if (typeof note === 'string') st.note = note;
}

// ---------- commands ----------
function cmdPreflight() {
  const root = flags['plugin-root'];
  if (typeof root !== 'string') usage('preflight needs --plugin-root');
  const state = startRun({
    screen: typeof flags.screen === 'string' ? flags.screen : '',
    source: typeof flags.source === 'string' ? flags.source : '',
  });
  markStart(state, 1);
  const missing = REQUIRED_SCRIPTS.filter((f) => !fs.existsSync(path.join(root, 'scripts', f)));

  // Keep the status-bar copy in the data folder in step with the installed plugin version.
  if (typeof flags.data === 'string') {
    try {
      const copy = path.join(flags.data, 'statusline.mjs');
      const source = path.join(root, 'scripts', 'statusline.mjs');
      if (fs.existsSync(copy) && fs.existsSync(source)
          && fs.readFileSync(copy, 'utf8') !== fs.readFileSync(source, 'utf8')) {
        fs.copyFileSync(source, copy);
      }
    } catch { /* the status bar is optional; never block a run on it */ }
  }

  const st = state.stages[1];
  st.endedAt = nowIso();
  const dur = fmtDuration(Date.parse(st.endedAt) - Date.parse(st.startedAt));
  if (missing.length) {
    // PENDING.json lists scripts this plugin version does not ship yet (work in progress).
    let pending = [];
    try { pending = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'PENDING.json'), 'utf8')).scripts || []; } catch { /* none */ }
    const notYetBuilt = missing.every((f) => pending.includes(f));
    st.status = 'failed';
    state.failed = true;
    const why = notYetBuilt
      ? details(`not in this plugin version yet: ${missing.join(', ')}`, 'nothing to fix on your side')
      : details(`missing ${missing.join(', ')}`, 'plugin files damaged: reinstall the plugin');
    emit(state, `${label(1)} ${G.fail}${why}`);
    process.exit(1);
  }
  st.status = 'done';
  emit(state, `${label(1)} ${G.ok} ${dur}${details('scripts ok')}`.replace(/\s+$/, ''));
}

function cmdStart() {
  const n = stageNumber(positional[1]);
  const state = ensureState();
  const note = typeof flags.note === 'string' ? flags.note : undefined;
  markStart(state, n, note);
  emit(state, `${label(n)} ${G.run}${note ? ` ${note}` : ''}`);
}

function cmdSub() {
  const n = stageNumber(positional[1]);
  const note = typeof flags.note === 'string' ? flags.note : '';
  if (!note) usage('sub needs --note');
  const state = ensureState();
  if (state.stages[n].status !== 'running') markStart(state, n);
  state.sub = note;
  emit(state, `${label(n)} ${G.run} ${note}`);
}

// The stage line's score and row count, straight from compare's result.json. The caller's
// --note can only add a reason after them; it can never replace the numbers.
function fromReport(dir, n, extra) {
  const base = path.resolve(projectDir, dir);
  let r;
  try { r = JSON.parse(fs.readFileSync(path.join(base, 'result.json'), 'utf8')); } catch { usage(`--from-report: no result.json in ${dir} - run compare first`); }
  const flagsOut = [];
  let build = null;
  try { build = JSON.parse(fs.readFileSync(path.join(base, 'build.json'), 'utf8')).capturedAt; } catch { /* no build yet */ }
  if (build && r.buildCapturedAt && build !== r.buildCapturedAt) flagsOut.push('stale: compare ran before the latest build capture');
  const expectedPass = n >= 6 && n <= 9 ? n - 5 : null;
  if (expectedPass && r.pass !== expectedPass) flagsOut.push(`from the pass ${r.pass} report`);
  if (/\d+\s*(rows?|differences?)\b|\d+\s*%|clean/i.test(extra)) usage('with --from-report, --note may give a reason but no row counts, percentages or "clean" - those come from result.json');
  const rows = r.clean ? '' : `${r.rows} row${r.rows === 1 ? '' : 's'} ${n === 6 ? 'to fix' : 'left'}`;
  return { score: r.score, note: [rows, ...flagsOut, extra].filter(Boolean).join(` ${G.dot} `) };
}

function cmdEnd(kind) {
  const n = stageNumber(positional[1]);
  const state = ensureState();
  const st = state.stages[n];
  let note = typeof flags.note === 'string' ? flags.note : '';
  let score = typeof flags.score === 'string' ? flags.score : '';
  if (kind === 'done' && typeof flags['from-report'] === 'string') ({ score, note } = fromReport(flags['from-report'], n, note));
  if (kind === 'fail' && !note) usage('fail needs --note explaining why');
  state.waiting = '';
  st.endedAt = nowIso();
  if (note) st.note = note;
  const dur = st.startedAt ? fmtDuration(Date.parse(st.endedAt) - Date.parse(st.startedAt)) : '';
  state.current = n;
  state.currentName = STAGES[n - 1];
  state.sub = '';
  let line;
  if (kind === 'done') {
    st.status = 'done';
    if (score) { st.score = score; state.score = score; }
    const extra = n === TOTAL ? `total ${fmtDuration(Date.now() - Date.parse(state.startedAt))}` : '';
    if (n === TOTAL) state.finished = true;
    line = `${label(n)} ${G.ok}${dur ? ` ${dur}` : ''}${details(score, note, extra)}`;
  } else if (kind === 'skip') {
    st.status = 'skipped';
    line = `${label(n)} ${G.skip}${details(note)}`;
  } else {
    st.status = 'failed';
    state.failed = true;
    line = `${label(n)} ${G.fail}${details(note)}`;
  }
  emit(state, line);
}

function cmdWait() {
  const n = stageNumber(positional[1]);
  const note = typeof flags.note === 'string' ? flags.note : '';
  if (!note) usage('wait needs --note with what the user is asked');
  const state = ensureState();
  const st = state.stages[n];
  st.status = 'waiting';
  st.note = note;
  state.current = n;
  state.currentName = STAGES[n - 1];
  state.sub = '';
  state.waiting = note;
  emit(state, `${label(n)} ${G.wait}${details(note)}`);
}

function cmdSet() {
  const state = ensureState();
  const changes = [];
  if (typeof flags.screen === 'string') { state.screen = flags.screen; changes.push(`screen ${flags.screen}`); }
  if (typeof flags.source === 'string') { state.source = flags.source; changes.push(`source ${flags.source}`); }
  if (!changes.length) usage('set needs --screen or --source');
  writeState(state);
  appendLog(`- ${clock()} ${changes.join(', ')}\n`);
  console.log(`${G.bar} ${changes.join(`, `)}`);
}

function cmdShow() {
  const state = readState();
  if (!state) { console.log('No artifact-parity run found in this project.'); return; }
  const doneCount = Object.values(state.stages).filter((s) => s.status === 'done' || s.status === 'skipped').length;
  console.log(`Run ${state.runId} ${G.dot} ${state.screen || 'screen pending'} ${G.dot} ${Math.round((doneCount / TOTAL) * 100)}%`);
  for (let n = 1; n <= TOTAL; n++) {
    const s = state.stages[n];
    const mark = { done: G.ok, skipped: G.skip, failed: G.fail, running: G.run, waiting: G.wait, pending: ' ' }[s.status] || s.status;
    const extra = details(s.score, s.note);
    console.log(`  [${n}/${TOTAL}] ${s.name} ${mark}${extra}`);
  }
  if (state.sub) console.log(`  now: ${state.sub}`);
}

switch (command) {
  case 'preflight': cmdPreflight(); break;
  case 'start': cmdStart(); break;
  case 'sub': cmdSub(); break;
  case 'done': cmdEnd('done'); break;
  case 'skip': cmdEnd('skip'); break;
  case 'fail': cmdEnd('fail'); break;
  case 'wait': cmdWait(); break;
  case 'set': cmdSet(); break;
  case 'show': cmdShow(); break;
  default: usage(command ? `unknown command "${command}"` : 'missing command');
}
