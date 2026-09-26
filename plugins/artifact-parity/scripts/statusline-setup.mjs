#!/usr/bin/env node
// Turns the artifact-parity status bar on or off by editing Claude Code's
// settings.json safely:
//   - dry run first: shows exactly what would change
//   - never overwrites an existing status bar unless --replace is given
//   - backs up settings.json before writing, keeps every other setting
//   - "--off" restores whatever status bar was there before
//
// Usage:
//   statusline-setup.mjs --on  --data <dir> --plugin-root <dir> [--scope user|project] [--project <dir>] [--replace] [--dry-run]
//   statusline-setup.mjs --off --data <dir> [--scope user|project] [--project <dir>] [--dry-run]
// Exit codes: 0 ok, 1 error (nothing changed), 3 existing status bar needs --replace.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const argv = process.argv.slice(2);
const flags = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) continue;
  const next = argv[i + 1];
  if (next !== undefined && !next.startsWith('--')) { flags[a.slice(2)] = next; i++; } else flags[a.slice(2)] = true;
}

function fail(msg, code = 1) { console.error(`statusbar: ${msg}`); process.exit(code); }
const fwd = (p) => p.replace(/\\/g, '/');

const turnOn = flags.on === true;
const turnOff = flags.off === true;
if (turnOn === turnOff) fail('pass exactly one of --on or --off');
if (typeof flags.data !== 'string') fail('--data <plugin data folder> is required');
const dataDir = path.resolve(flags.data);
const scope = flags.scope === 'project' ? 'project' : 'user';
const dryRun = flags['dry-run'] === true;
const configDir = process.env.CLAUDE_CONFIG_DIR ? path.resolve(process.env.CLAUDE_CONFIG_DIR) : path.join(os.homedir(), '.claude');
const projectDir = path.resolve(typeof flags.project === 'string' ? flags.project : '.');
const settingsPath = scope === 'user'
  ? path.join(configDir, 'settings.json')
  : path.join(projectDir, '.claude', 'settings.local.json');
const scriptCopy = path.join(dataDir, 'statusline.mjs');
const previousPath = path.join(dataDir, `statusline-previous-${scope}.json`);
const ourCommand = `node "${fwd(scriptCopy)}"`;
const isOurs = (sl) => !!sl && typeof sl.command === 'string' && fwd(sl.command).includes(fwd(scriptCopy));

function readSettings() {
  if (!fs.existsSync(settingsPath)) return {};
  const raw = fs.readFileSync(settingsPath, 'utf8');
  if (!raw.trim()) return {};
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('not a JSON object');
    return data;
  } catch (e) {
    fail(`cannot parse ${settingsPath} (${e.message}). Nothing was changed.`);
  }
  return {};
}

function writeSettings(data) {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  if (fs.existsSync(settingsPath)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(settingsPath, `${settingsPath}.bak-parity-${stamp}`);
  }
  const tmp = `${settingsPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  fs.renameSync(tmp, settingsPath);
}

const settings = readSettings();
const current = settings.statusLine;

if (turnOn) {
  if (typeof flags['plugin-root'] !== 'string') fail('--plugin-root is required with --on');
  const source = path.join(path.resolve(flags['plugin-root']), 'scripts', 'statusline.mjs');
  if (!fs.existsSync(source)) fail(`status bar script not found at ${source}`);
  const next = {
    type: 'command',
    command: ourCommand,
    refreshInterval: current && isOurs(current) && current.refreshInterval ? current.refreshInterval : 5,
  };
  if (current && !isOurs(current) && flags.replace !== true) {
    console.log(`You already have a status bar in ${fwd(settingsPath)}:`);
    console.log(`  ${JSON.stringify(current)}`);
    console.log('Run again with --replace to use the artifact-parity bar instead. "--off" will restore this one.');
    process.exit(3);
  }
  console.log(`${dryRun ? 'Would change' : 'Changing'} ${fwd(settingsPath)}:`);
  console.log(`  statusLine: ${current ? JSON.stringify(current) : '(none)'}`);
  console.log(`          ->  ${JSON.stringify(next)}`);
  console.log(`Copy status bar script to ${fwd(scriptCopy)}`);
  if (dryRun) process.exit(0);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.copyFileSync(source, scriptCopy);
  if (!isOurs(current)) {
    fs.writeFileSync(previousPath, JSON.stringify({ settingsPath, previous: current ?? null }, null, 2));
  }
  settings.statusLine = next;
  writeSettings(settings);
  console.log('Status bar is ON. It appears after your next message in Claude Code.');
} else {
  if (!isOurs(current)) {
    console.log(`The status bar in ${fwd(settingsPath)} is not the artifact-parity one, so nothing was changed.`);
    process.exit(0);
  }
  let previous = null;
  try { previous = JSON.parse(fs.readFileSync(previousPath, 'utf8')).previous ?? null; } catch { previous = null; }
  console.log(`${dryRun ? 'Would change' : 'Changing'} ${fwd(settingsPath)}:`);
  console.log(`  statusLine: ${JSON.stringify(current)}`);
  console.log(`          ->  ${previous ? JSON.stringify(previous) : '(removed)'}`);
  if (dryRun) process.exit(0);
  if (previous) settings.statusLine = previous; else delete settings.statusLine;
  writeSettings(settings);
  try { fs.unlinkSync(previousPath); } catch { /* already gone */ }
  console.log('Status bar is OFF.');
}
