#!/usr/bin/env node
// The recommended-skills offer for artifact-parity.
//
// Reads the plugin's bundle.json (the design skills and the optional plugins it recommends),
// checks which are installed using local files only, and remembers the user's answer in
// <DATA>/skill-offer.json so the offer is not repeated.
//
// Usage:
//   skills-offer.mjs --check [--json] [--project <dir>]   installed / missing / other-source / kept, per item
//   skills-offer.mjs --hook                                SessionStart hook: prints hook JSON, or nothing
//   skills-offer.mjs --commands (--all | --pick a,b) [--plugins a,b]
//                                                          install commands: --all = every missing design skill,
//                                                          --pick = exactly those; with neither, no design skill
//   skills-offer.mjs --backup a,b                          copy those installed skill folders to <DATA>/backup/ first
//   skills-offer.mjs --record installed|chosen|later|never [--names a,b] [--kept a,b]
//                                                          --names: skills this run installed; --kept: "keep mine" answers
//   skills-offer.mjs --track a,b                           add skills installed by a build or design to the plugin's list
//   skills-offer.mjs --remove-commands                     the command that removes the skills this plugin installed
//   skills-offer.mjs --installs a,b                        skills.sh install counts (NETWORK; cached 7 days); all else is local
//   skills-offer.mjs --self-test
// Options: --data <dir> (default $CLAUDE_PLUGIN_DATA, then <config>/plugins/data/artifact-parity-artifact-tools)
// Env:     CLAUDE_CONFIG_DIR overrides ~/.claude. PARITY_ASCII=1 for plain ASCII output.
//          PARITY_OFFER_SIMULATE_MISSING=a,b reports those items as missing (for testing the offer).
// Exit codes: 0 ok (the hook always exits 0), 1 the skill listing failed or the self-test failed, 2 usage error.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.dirname(HERE);
const DATA_NAME = 'artifact-parity-artifact-tools';
const ANSWERS = ['installed', 'chosen', 'later', 'never'];
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const SNOOZE = 7 * DAY;
const ASCII = process.env.PARITY_ASCII === '1';
const G = ASCII ? { ok: 'OK', no: '--', odd: '!!', sep: '|' } : { ok: '✔', no: '✖', odd: '!', sep: '·' };

// ---------- arguments ----------
const argv = process.argv.slice(2);
const flags = {};
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue;
  const next = argv[i + 1];
  if (next !== undefined && !next.startsWith('--')) { flags[argv[i].slice(2)] = next; i++; } else flags[argv[i].slice(2)] = true;
}

function usage(msg) {
  if (msg) console.error(`skills-offer: ${msg}`);
  console.error('usage: skills-offer.mjs --check [--json] | --hook | --commands (--all | --pick a,b) [--plugins a,b] | --backup a,b | --record <installed|chosen|later|never> [--names a,b] [--kept a,b] | --track a,b | --remove-commands | --installs a,b | --self-test');
  process.exit(2);
}

const list = (v) => (typeof v === 'string' ? v.split(',').map((x) => x.trim()).filter(Boolean) : null);
const readJson = (file) => {
  // Some tools write JSON with a UTF-8 byte order mark; JSON.parse rejects it.
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch { return null; }
};
const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
// A value like "${CLAUDE_PLUGIN_DATA}" that no one expanded is not a folder.
const usable = (v) => typeof v === 'string' && v.trim() !== '' && !v.includes('${');

// ---------- environment ----------
function defaultEnv() {
  const configDir = process.env.CLAUDE_CONFIG_DIR ? path.resolve(process.env.CLAUDE_CONFIG_DIR) : path.join(os.homedir(), '.claude');
  const dataDir = usable(flags.data) ? path.resolve(flags.data)
    : usable(process.env.CLAUDE_PLUGIN_DATA) ? path.resolve(process.env.CLAUDE_PLUGIN_DATA)
      : path.join(configDir, 'plugins', 'data', DATA_NAME);
  return {
    configDir,
    dataDir,
    projectDir: path.resolve(usable(flags.project) ? flags.project : '.'),
    // The skills.sh CLI records where each skill came from here (skills CLI 1.7, lock version 3).
    // Same rule as the skills CLI (getSkillLockPath).
    lockFile: process.env.XDG_STATE_HOME ? path.join(process.env.XDG_STATE_HOME, 'skills', '.skill-lock.json')
      : path.join(os.homedir(), '.agents', '.skill-lock.json'),
    bundleFile: path.join(PLUGIN_ROOT, 'bundle.json'),
    listSkills: path.join(HERE, 'list-skills.mjs'),
    simulateMissing: list(process.env.PARITY_OFFER_SIMULATE_MISSING) || [],
    now: Date.now(),
  };
}

const offerFile = (env) => path.join(env.dataDir, 'skill-offer.json');

// ---------- the check ----------
function installedSkillNames(env) {
  // The hook must finish inside its 15 s limit; a command the user is waiting on can take longer on a busy machine.
  const r = spawnSync(process.execPath, [env.listSkills, '--json', '--project', env.projectDir], {
    encoding: 'utf8', env: { ...process.env, CLAUDE_CONFIG_DIR: env.configDir }, timeout: flags.hook ? 8000 : 20000,
  });
  const out = (() => { try { return JSON.parse(r.stdout); } catch { return null; } })();
  // A slow or failed listing must not read as "nothing installed": that would offer everything.
  if (r.status !== 0 || !Array.isArray(out?.skills)) throw new Error(`list-skills.mjs failed${r.error ? ` (${r.error.code || r.error.message})` : ''}`);
  // Plugin skills are listed as "plugin:skill"; the base name is what a bundle entry matches.
  return new Set(out.skills.map((s) => String(s.name).split(':').pop().toLowerCase()));
}

function installedPluginIds(env) {
  const data = readJson(path.join(env.configDir, 'plugins', 'installed_plugins.json'));
  const off = new Set(Object.entries(readJson(path.join(env.configDir, 'settings.json'))?.enabledPlugins || {})
    .filter(([, on]) => on === false).map(([id]) => id));
  const ids = new Set();
  for (const [id, entries] of Object.entries(data?.plugins || {})) {
    if (off.has(id)) continue;
    // A project- or local-scoped install only counts in that project.
    const here = (Array.isArray(entries) ? entries : [entries]).some((e) => e
      && ((e.scope !== 'project' && e.scope !== 'local') || (e.projectPath && samePath(e.projectPath, env.projectDir))));
    if (here) ids.add(id);
  }
  return ids;
}

function check(env) {
  const bundle = readJson(env.bundleFile);
  if (!bundle || !Array.isArray(bundle.design)) throw new Error(`cannot read ${env.bundleFile}`);
  const names = installedSkillNames(env);
  const lock = readJson(env.lockFile)?.skills || {};
  const offer = readJson(offerFile(env));
  const kept = new Set(offer?.kept || []);
  const sim = new Set(env.simulateMissing);
  const design = bundle.design.map((s) => {
    const source = lock[s.name]?.source || '';
    let status = 'missing';
    if (sim.has(s.name)) status = 'missing';
    else if (names.has(s.name.toLowerCase())) {
      const other = source && source.toLowerCase() !== s.repo.toLowerCase();
      status = !other ? 'installed' : kept.has(s.name) ? 'kept' : 'other-source';
    }
    return { ...s, status, source, link: `https://skills.sh/${s.repo}/${s.name}` };
  });
  const pluginIds = installedPluginIds(env);
  // A plugin whose skill is already installed on its own (skills add) works, just without the plugin's hooks.
  const optional = (bundle.optional || []).map((p) => ({
    ...p,
    status: sim.has(p.name) ? 'missing' : pluginIds.has(p.id) ? 'installed' : names.has(p.name.toLowerCase()) ? 'as-skills' : 'missing',
  }));
  return { version: bundle.version || 1, cli: bundle.cli || 'skills', groups: bundle.groups || {}, parts: bundle.parts || {}, design, optional, offer, installed: [...names] };
}

// ---------- the hook decision ----------
// Offer when a design skill is missing, or once for the optional plugins. Never after "never";
// not again for a bundle version already answered; "later" waits 7 days or for a newer bundle.
function hookMessage(state, now = Date.now()) {
  const { offer, version } = state;
  if (offer?.answer === 'never') return null;
  // A record made only by --track holds no answer: the offer still counts as never made.
  const answered = Boolean(offer?.answer);
  const sameVersion = answered && Number(offer.bundleVersion) >= version;
  if (sameVersion && offer.answer !== 'later') return null;
  if (sameVersion && offer.answer === 'later' && now < Date.parse(offer.at || 0) + SNOOZE) return null;
  const missing = state.design.filter((s) => s.status === 'missing').map((s) => s.name);
  const optionalMissing = state.optional.filter((p) => p.status === 'missing').map((p) => p.name);
  if (!missing.length && (answered || !optionalMissing.length)) return null;
  const what = missing.length
    ? `${missing.length} recommended design skill${missing.length === 1 ? ' is' : 's are'} not installed yet (${missing.join(', ')})`
    : `the optional plugins (${optionalMissing.join(', ')}) have not been offered yet`;
  return {
    systemMessage: `artifact-parity: ${what}. Type /artifact-parity:skills to see them, or send any message and Claude will offer them.`,
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: `artifact-parity: ${what}. Offer them only if a person is chatting with you in this session and the AskUserQuestion tool is available; `
        + 'in a non-interactive run (claude -p, a scheduled, automated or bot-driven run) do nothing and record nothing. '
        + 'To offer: invoke the artifact-parity:skills skill at the start of your first reply (it shows the list and asks once), then continue with what the user asked. '
        + 'Exception: when the first message runs /artifact-parity:build or /artifact-parity:design, do not interrupt it; offer after that command has finished, '
        + 'and not at all if that command already asked about the recommended skills.',
    },
  };
}

// ---------- install and remove commands ----------
// Nothing is installed by default: --all is needed for "every missing design skill".
function commands(state, pick, pluginPick, all = false) {
  const wanted = all ? state.design.filter((s) => s.status === 'missing')
    : state.design.filter((s) => (pick || []).includes(s.name));
  const byRepo = new Map();
  for (const s of wanted) byRepo.set(s.repo, [...(byRepo.get(s.repo) || []), s.name]);
  // One repo per command; the source must come first because -s and -a take every following word.
  const skills = [...byRepo].map(([repo, names]) => `npx -y ${state.cli} add "${repo}" -s ${names.join(' ')} -g -y -a claude-code`);
  const plugins = state.optional.filter((p) => (pluginPick || []).includes(p.name)).map((p) => ({
    name: p.name,
    cli: [`claude plugin marketplace add ${p.marketplace}`, `claude plugin install ${p.id}`],
    slash: [`/plugin marketplace add ${p.marketplace}`, `/plugin install ${p.id}`],
  }));
  const unknown = [
    ...(pick || []).filter((n) => !state.design.some((s) => s.name === n)),
    ...(pluginPick || []).filter((n) => !state.optional.some((p) => p.name === n)),
  ];
  // Replacing a same-name skill deletes the user's copy, so it needs a backup first.
  const needBackup = wanted.filter((s) => s.status === 'other-source' || s.status === 'kept').map((s) => s.name);
  return { skills, plugins, unknown, needBackup };
}

function removeCommand(state) {
  // Ours = bundle skills still installed from our repo, plus other skills a build or design installed (--track).
  const installed = new Set((state.installed || []).map((n) => n.toLowerCase()));
  const ours = (state.offer?.ours || []).filter((n) => {
    const b = state.design.find((s) => s.name === n);
    return b ? b.status === 'installed' : installed.has(n.toLowerCase());
  });
  return { names: ours, command: ours.length ? `npx -y ${state.cli} remove ${ours.join(' ')} -g -y` : '' };
}

function backup(env, names) {
  const stamp = new Date(env.now).toISOString().replace(/[:.]/g, '-');
  const saved = [];
  for (const name of names) {
    const link = path.join(env.configDir, 'skills', name);
    let real;
    try { real = fs.realpathSync(link); } catch { continue; } // nothing there, nothing to lose
    const to = path.join(env.dataDir, 'backup', `${name}-${stamp}`);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.cpSync(real, to, { recursive: true });
    saved.push({ name, from: real, to });
  }
  return saved;
}

function record(env, answer, version, { names = [], kept = [] } = {}) {
  const prev = readJson(offerFile(env)) || {};
  const union = (a, b) => [...new Set([...(a || []), ...b])];
  fs.mkdirSync(env.dataDir, { recursive: true });
  // --track (answer null) only adds names; it never changes the user's answer to the offer.
  // "Never ask" is the user's standing answer: a later record never turns session-start offers back on.
  if (prev.answer === 'never' && answer !== null) answer = 'never';
  const next = answer === null
    ? { ...prev, ours: union(prev.ours, names) }
    : { answer, bundleVersion: version, at: new Date(env.now).toISOString(), ours: union(prev.ours, names), kept: union(prev.kept, kept) };
  fs.writeFileSync(offerFile(env), JSON.stringify(next, null, 2));
  return offerFile(env);
}

// ---------- install counts (the only network use) ----------
// skills.sh's search API, the one the skills CLI itself calls. Undocumented, so any
// failure or change simply gives "unknown".
function pickInstalls(json, source, name) {
  const hit = (json?.skills || []).find((s) => String(s.source).toLowerCase() === source.toLowerCase()
    && [s.skillId, s.name].some((n) => String(n).toLowerCase() === name.toLowerCase()));
  return Number.isFinite(hit?.installs) ? hit.installs : null;
}

async function installs(env, state, names) {
  const lock = readJson(env.lockFile)?.skills || {};
  const cacheFile = path.join(env.dataDir, 'installs-cache.json');
  const cache = readJson(cacheFile) || {};
  const base = process.env.SKILLS_API_URL || 'https://skills.sh';
  // One deadline for the whole call, so a network that drops packets costs seconds, not minutes.
  const deadline = AbortSignal.timeout(10000);
  const lookup = async (name) => {
    // The installed copy's own source first: a same-name skill from another author is not ours.
    const source = lock[name]?.source || state.design.find((s) => s.name === name)?.repo || '';
    if (!source) return [name, { source: '', installs: null, why: 'not from skills.sh' }];
    const key = `${source}@${name}`.toLowerCase();
    const hit = cache[key];
    if (hit && env.now - hit.at < (hit.installs === null ? HOUR : SNOOZE)) return [name, { source, installs: hit.installs, cached: true }];
    let n = null;
    // The name alone can rank below 20 unrelated skills ("animate"); owner + name finds it.
    for (const q of [`${source.split('/')[0]} ${name}`, name]) {
      try {
        const r = await fetch(`${base}/api/search?q=${encodeURIComponent(q)}&limit=20`, { signal: deadline });
        if (r.ok) n = pickInstalls(await r.json(), source, name);
      } catch { break; } // offline, blocked or out of time: unknown
      if (n !== null) break;
    }
    cache[key] = { installs: n, at: env.now }; // an unknown is kept for an hour only
    return [name, { source, installs: n }];
  };
  const out = Object.fromEntries(await Promise.all(names.map(lookup)));
  try { fs.mkdirSync(env.dataDir, { recursive: true }); fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2)); } catch { /* cache is optional */ }
  return out;
}

// ---------- output ----------
function printCheck(state) {
  const done = state.design.filter((s) => s.status !== 'missing').length;
  console.log(`Design skills (${done} of ${state.design.length} installed):`);
  for (const s of state.design) {
    if (s.status === 'installed') console.log(`  ${G.ok} ${s.name} ${G.sep} ${s.repo}`);
    else if (s.status === 'kept') console.log(`  ${G.ok} ${s.name} ${G.sep} yours from ${s.source}, kept`);
    else if (s.status === 'other-source') console.log(`  ${G.odd} ${s.name} ${G.sep} installed from ${s.source}; ours is ${s.repo}`);
    else console.log(`  ${G.no} ${s.name} ${G.sep} ${s.repo} ${G.sep} missing ${G.sep} ${s.for}`);
  }
  console.log('Optional plugins:');
  const said = { installed: 'installed', 'as-skills': 'installed as skills only (no auto-start)', missing: 'not installed' };
  for (const p of state.optional) {
    console.log(`  ${p.status === 'missing' ? G.no : G.ok} ${p.id} ${G.sep} ${said[p.status]} ${G.sep} ${p.for}`);
  }
  const o = state.offer;
  console.log(o?.answer ? `Last answer: ${o.answer} (bundle ${o.bundleVersion}, ${o.at})` : 'Last answer: never offered');
}

// ---------- self-test ----------
function selfTest() {
  const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-offer-'));
  try {
    const configDir = path.join(tmp, 'config');
    const skill = (name) => {
      fs.mkdirSync(path.join(configDir, 'skills', name), { recursive: true });
      fs.writeFileSync(path.join(configDir, 'skills', name, 'SKILL.md'), `---\nname: ${name}\ndescription: test\n---\n`);
    };
    skill('design-taste-frontend');
    skill('animate');
    skill('tailwind-v4');
    const lockFile = path.join(tmp, 'lock.json');
    fs.writeFileSync(lockFile, `﻿${JSON.stringify({ version: 3, skills: {
      'design-taste-frontend': { source: 'leonxlnx/taste-skill' }, animate: { source: 'pbakaus/impeccable' },
    } })}`);
    const projectDir = path.join(tmp, 'project');
    fs.mkdirSync(path.join(configDir, 'plugins'), { recursive: true });
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: {
      'ponytail@ponytail': [{ scope: 'user', installPath: tmp }],
      'caveman@caveman': [{ scope: 'project', projectPath: path.join(tmp, 'elsewhere'), installPath: tmp }],
    } }));
    const env = { ...defaultEnv(), configDir, lockFile, projectDir, dataDir: path.join(tmp, 'data'), simulateMissing: [] };

    let state = check(env);
    const by = Object.fromEntries(state.design.map((s) => [s.name, s.status]));
    assert(by['design-taste-frontend'] === 'installed', 'a skill from our repo counts as installed (lock file with a BOM)');
    assert(by.animate === 'other-source', 'a same-name skill from another repo is flagged, not counted as ours');
    assert(by.impeccable === 'missing', 'an absent skill is missing');
    const pl = Object.fromEntries(state.optional.map((p) => [p.name, p.status]));
    assert(pl.ponytail === 'installed', 'a user-scope plugin counts');
    assert(pl.caveman === 'missing', "another project's plugin does not count here");
    skill('caveman');
    assert(check(env).optional.find((p) => p.name === 'caveman').status === 'as-skills', 'a plugin already present as a plain skill is not offered as missing');
    fs.rmSync(path.join(configDir, 'skills', 'caveman'), { recursive: true });
    assert(check({ ...env, simulateMissing: ['design-taste-frontend'] }).design[0].status === 'missing', 'simulated missing');

    const cmd = commands(state, null, ['caveman'], true);
    assert(commands(state, null, ['caveman']).skills.length === 0, 'without --all or --pick no design skill is installed');
    assert(cmd.skills.some((c) => c.includes('skills@1.7.0 add "leonxlnx/taste-skill" -s high-end-visual-design redesign-existing-projects')), 'pinned CLI, grouped by repo, installed ones left out');
    assert(cmd.skills.some((c) => c.includes('"emilkowalski/skills" -s emil-design-eng -g')), 'the other-source animate is never replaced unasked');
    assert(cmd.skills.some((c) => c.includes('"pbakaus/impeccable" -s impeccable -g')), 'impeccable alone, never the whole repo');
    assert(cmd.skills.every((c) => /^npx -y skills@[\d.]+ add "/.test(c)), 'source comes first');
    assert(cmd.plugins.length === 1 && cmd.plugins[0].cli[1] === 'claude plugin install caveman@caveman', 'plugin commands');
    const picked = commands(state, ['animate', 'nope'], null);
    assert(picked.skills[0].includes('-s animate') && picked.needBackup[0] === 'animate', 'a picked replacement is included and needs a backup');
    assert(picked.unknown[0] === 'nope', 'unknown picks are reported');

    const saved = backup(env, ['animate', 'not-there']);
    assert(saved.length === 1 && fs.existsSync(path.join(saved[0].to, 'SKILL.md')), 'backup copies the existing folder and skips absent ones');

    assert(hookMessage(state)?.hookSpecificOutput.hookEventName === 'SessionStart', 'first session offers');
    record(env, 'later', state.version);
    assert(!hookMessage(check(env), env.now + DAY), '"later" waits');
    assert(hookMessage(check(env), env.now + 8 * DAY), '"later" offers again after 7 days');
    assert(hookMessage({ ...check(env), version: state.version + 1 }, env.now + DAY), '"later" offers again for a newer bundle');
    record(env, 'installed', state.version, { names: ['impeccable'], kept: ['animate'] });
    assert(!hookMessage(check(env)), 'an answer for this bundle version stops the offer');
    state = check(env);
    assert(state.design.find((s) => s.name === 'animate').status === 'kept', '"keep mine" is remembered');
    assert(hookMessage({ ...state, version: state.version + 1 }), 'a newer bundle version offers again');
    record(env, 'never', state.version, { names: ['find-skills'] });
    record(env, null, state.version, { names: ['tailwind-v4'] });
    assert(check(env).offer.answer === 'never', '--track never changes the answer');
    assert(!hookMessage({ ...check(env), version: state.version + 5 }), '"never" holds for every bundle version');
    assert(check(env).offer.ours.join() === 'impeccable,find-skills,tailwind-v4', 'installed and tracked names accumulate for removal');
    const rm = removeCommand({ ...state, offer: check(env).offer, design: state.design.map((s) => ({ ...s, status: 'installed' })) });
    assert(rm.command === 'npx -y skills@1.7.0 remove impeccable find-skills tailwind-v4 -g -y', 'remove what this plugin installed, tracked skills included');
    record(env, 'later', state.version);
    assert(check(env).offer.answer === 'never', '"never" is not overwritten by a later record');

    const allIn = { ...state, offer: null, design: state.design.map((s) => ({ ...s, status: 'installed' })), optional: state.optional.map((p) => ({ ...p, status: 'installed' })) };
    assert(!hookMessage(allIn), 'nothing to offer when everything is installed');
    assert(hookMessage({ ...allIn, optional: state.optional }), 'optional plugins are offered once when never asked');
    assert(!hookMessage({ ...allIn, optional: state.optional, offer: { answer: 'chosen', bundleVersion: state.version } }), '...but not again after an answer');
    assert(hookMessage({ ...allIn, optional: state.optional, offer: { ours: ['x'] } }), 'a --track-only record does not count as an answer');

    assert(pickInstalls({ skills: [{ source: 'EmilKowalski/skills', skillId: 'animate', installs: 98300 }, { source: 'pbakaus/impeccable', skillId: 'animate', installs: 5 }] }, 'emilkowalski/skills', 'animate') === 98300, 'installs match source and name');
    assert(pickInstalls({ skills: [] }, 'a/b', 'c') === null && pickInstalls(null, 'a/b', 'c') === null, 'no hit is unknown');

    let threw = false;
    try { check({ ...env, listSkills: path.join(tmp, 'missing.mjs') }); } catch { threw = true; }
    assert(threw, 'a failed skill listing throws instead of reporting everything as missing');
    console.log('skills-offer self-test: ok');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------- main ----------
if (flags['self-test']) {
  try { selfTest(); } catch (e) { console.error(`skills-offer self-test FAILED: ${e.message}`); process.exit(1); }
} else if (flags.hook) {
  // Never block or break a session start: any problem means no offer this time.
  try { const m = hookMessage(check(defaultEnv())); if (m) console.log(JSON.stringify(m)); } catch { /* no offer */ }
  process.exit(0);
} else if (flags.check || flags.commands || flags['remove-commands'] || typeof flags.record === 'string'
  || typeof flags.backup === 'string' || typeof flags.installs === 'string' || typeof flags.track === 'string') {
  if (typeof flags.record === 'string' && !ANSWERS.includes(flags.record)) usage(`--record must be one of ${ANSWERS.join(', ')}`);
  const env = defaultEnv();
  let state;
  try { state = check(env); } catch (e) { console.error(`skills-offer: ${e.message} - try again in a moment`); process.exit(1); }
  if (flags.check) {
    if (flags.json) console.log(JSON.stringify(state, null, 2)); else printCheck(state);
  } else if (flags.commands) {
    if (flags.all && typeof flags.pick === 'string') usage('--all and --pick cannot be combined');
    console.log(JSON.stringify(commands(state, list(flags.pick), list(flags.plugins), flags.all === true), null, 2));
  } else if (flags['remove-commands']) {
    console.log(JSON.stringify(removeCommand(state), null, 2));
  } else if (typeof flags.backup === 'string') {
    console.log(JSON.stringify(backup(env, list(flags.backup)), null, 2));
  } else if (typeof flags.track === 'string') {
    console.log(`tracked ${list(flags.track).join(', ')} in ${record(env, null, state.version, { names: list(flags.track) })}`);
  } else if (typeof flags.installs === 'string') {
    console.log(JSON.stringify(await installs(env, state, list(flags.installs)), null, 2));
  } else {
    const file = record(env, flags.record, state.version, { names: list(flags.names) || [], kept: list(flags.kept) || [] });
    console.log(`recorded "${flags.record}" in ${file}`);
  }
} else {
  usage(argv.length ? 'unknown option' : 'missing option');
}
