// Shared helpers: load the dependencies that setup.mjs installed into the
// plugin data folder, and launch the browser that setup verified.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export const DEPS = { playwright: '1.63.0', pngjs: '7.0.0', pixelmatch: '7.2.0' };
export const STAMP_FILE = '.setup-stamp.json';

export function readStamp(dataDir) {
  try { return JSON.parse(fs.readFileSync(path.join(dataDir, STAMP_FILE), 'utf8')); } catch { return null; }
}

function dataRequire(dataDir) {
  const pkg = path.join(dataDir, 'package.json');
  if (!fs.existsSync(pkg)) throw new Error(`dependencies not installed in ${dataDir} - run setup.mjs first`);
  return createRequire(pkg);
}

export function loadPlaywright(dataDir) {
  return dataRequire(dataDir)('playwright');
}

export function playwrightCli(dataDir) {
  const main = dataRequire(dataDir).resolve('playwright');
  return path.join(path.dirname(main), 'cli.js');
}

// ESM-only packages (pixelmatch) are loaded with import() from their resolved path.
export async function loadModule(dataDir, name) {
  const req = dataRequire(dataDir);
  const resolved = req.resolve(name);
  try {
    const m = req(name);
    // Newer Node versions can require() an ES module and return its namespace object.
    return m && m[Symbol.toStringTag] === 'Module' ? (m.default ?? m) : m;
  } catch (e) {
    if (e.code !== 'ERR_REQUIRE_ESM' && !/ES Module/i.test(e.message)) throw e;
  }
  const mod = await import(pathToFileURL(resolved).href);
  return mod.default ?? mod;
}

// Launch the browser recorded by setup: the Playwright-managed Chromium, or a
// system Chrome/Edge channel when the Chromium download was blocked.
export async function launchBrowser(dataDir, options = {}) {
  const { chromium } = loadPlaywright(dataDir);
  const stamp = readStamp(dataDir);
  const channel = stamp?.browser?.channel;
  return chromium.launch({ headless: true, ...(channel ? { channel } : {}), ...options });
}
