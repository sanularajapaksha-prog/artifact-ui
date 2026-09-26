#!/usr/bin/env node
// Installs (once) and verifies what artifact-parity needs, in the plugin data
// folder, so your project's package.json is never touched:
//   playwright + pngjs + pixelmatch (pinned versions), and a browser.
// The browser is Playwright's Chromium; if that download is blocked (proxy),
// it falls back to Microsoft Edge or Google Chrome already on the machine.
//
// Usage: node setup.mjs --data <dir> [--force]
// Exit codes: 0 ready, 1 failed (message says why and what to do).

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DEPS, STAMP_FILE, readStamp, loadPlaywright, playwrightCli } from './lib/deps.mjs';

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  return v !== undefined && !v.startsWith('--') ? v : true;
};
const dataArg = flag('data');
if (typeof dataArg !== 'string') { console.error('setup: --data <plugin data folder> is required'); process.exit(1); }
const dataDir = path.resolve(dataArg);
const force = flag('force') === true;
// Test-only override (the sandbox's preinstalled browsers match an older Playwright).
const deps = { ...DEPS, ...(typeof flag('playwright-version') === 'string' ? { playwright: flag('playwright-version') } : {}) };

const isWin = process.platform === 'win32';
const q = (s) => `"${String(s).replace(/"/g, '\\"')}"`;
function run(cmd, args, opts = {}) {
  // Windows needs a shell to run npm.cmd; quote every argument ourselves.
  const r = isWin
    ? spawnSync([cmd, ...args.map(q)].join(' '), { shell: true, encoding: 'utf8', ...opts })
    : spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  return { ok: r.status === 0, out: `${r.stdout || ''}${r.stderr || ''}`.trim(), error: r.error };
}
function lastLines(text, n = 2) {
  // Keep the meaningful error lines, not stack-trace frames.
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^at\s/.test(l));
  const errors = lines.filter((l) => /error|failed|denied|timed? ?out|ENOTFOUND|ECONN|proxy|certificate/i.test(l));
  return (errors.length ? errors : lines).slice(-n).join(' | ').slice(0, 300);
}
function fail(msg) { console.log(`✖ setup failed: ${msg}`); process.exit(1); }

async function browserWorks(channel) {
  try {
    const { chromium } = loadPlaywright(dataDir);
    const browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
    const page = await browser.newPage();
    await page.setContent('<p id="ok">ok</p>');
    const text = await page.textContent('#ok');
    await browser.close();
    return text === 'ok';
  } catch {
    return false;
  }
}

async function main() {
  fs.mkdirSync(dataDir, { recursive: true });
  const stamp = readStamp(dataDir);
  const depsMatch = stamp && JSON.stringify(stamp.deps) === JSON.stringify(deps);

  if (!force && depsMatch && stamp.browser && await browserWorks(stamp.browser.channel)) {
    console.log(`✔ dependencies ready (playwright ${deps.playwright}, browser: ${stamp.browser.channel || 'chromium'})`);
    return;
  }

  // 1. npm packages into the data folder
  const pkg = path.join(dataDir, 'package.json');
  if (!fs.existsSync(pkg)) {
    fs.writeFileSync(pkg, JSON.stringify({ name: 'artifact-parity-deps', private: true }, null, 2));
  }
  if (force || !depsMatch) {
    const npm = isWin ? 'npm.cmd' : 'npm';
    const specs = Object.entries(deps).map(([n, v]) => `${n}@${v}`);
    const r = run(npm, ['install', '--prefix', dataDir, '--no-audit', '--no-fund', '--loglevel=error', ...specs]);
    if (!r.ok) {
      fail(`npm install did not finish (${r.error ? r.error.message : lastLines(r.out)}). `
        + 'Check your internet or proxy settings for npm, then run the build again.');
    }
  }

  // 2. browser: Playwright Chromium first, then Edge / Chrome already installed
  let browser = null;
  const install = run(process.execPath, [playwrightCli(dataDir), 'install', 'chromium']);
  if (install.ok && await browserWorks(undefined)) {
    browser = { channel: null };
  } else {
    for (const channel of ['msedge', 'chrome']) {
      if (await browserWorks(channel)) { browser = { channel }; break; }
    }
  }
  if (!browser) {
    fail('could not download Playwright Chromium '
      + `(${lastLines(install.out) || 'no output'}) and found no Microsoft Edge or Google Chrome to use instead. `
      + 'Install Edge or Chrome, or ask IT to allow the Playwright browser download, then run the build again.');
  }

  fs.writeFileSync(path.join(dataDir, STAMP_FILE), JSON.stringify({
    deps, browser, node: process.version, platform: process.platform, installedAt: new Date().toISOString(),
  }, null, 2));
  console.log(`✔ dependencies installed (playwright ${deps.playwright}, browser: ${browser.channel || 'chromium'})`);
}

main().catch((e) => fail(e.message));
