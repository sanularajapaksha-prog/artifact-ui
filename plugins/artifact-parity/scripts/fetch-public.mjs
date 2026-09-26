#!/usr/bin/env node
// Fetches an artifact's source from a claude.ai link in a real browser.
// Works for public links (claude.ai/public/artifacts/...) and share links
// (claude.ai/artifact/<id>?sk=...) that open without a login.
//
// claude.ai shows the artifact inside a sandboxed frame. This script finds
// that frame and saves its ORIGINAL document (before scripts ran). If that
// can't be downloaded, it saves the frame's rendered DOM instead and says so.
//
// Usage: node fetch-public.mjs --data <dir> --url <link> --out <dir> [--timeout <sec>]
// Exit codes: 0 saved, 1 could not get the source (reason printed), 2 usage error.

import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser } from './lib/deps.mjs';

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  return v !== undefined && !v.startsWith('--') ? v : true;
};
const data = flag('data');
const url = flag('url');
const out = flag('out');
if (typeof data !== 'string' || typeof url !== 'string' || typeof out !== 'string') {
  console.error('fetch-public: --data, --url and --out are required');
  process.exit(2);
}
const timeoutMs = (Number(flag('timeout')) || 45) * 1000;
// Hosts that serve artifact content inside claude.ai. --frame-host adds one (used by tests).
const frameHosts = ['claudeusercontent.com', 'claude.site', 'claudemcpcontent.com'];
if (typeof flag('frame-host') === 'string') frameHosts.push(flag('frame-host'));

class FetchError extends Error {}
// Throw instead of exiting, so the browser is always closed before the process ends.
const fail = (msg) => { throw new FetchError(msg); };

function hostOf(u) { try { return new URL(u).host; } catch { return ''; } }
const isArtifactFrame = (f) => frameHosts.some((h) => hostOf(f.url()) === h || hostOf(f.url()).endsWith(`.${h}`));

async function main() {
  const browser = await launchBrowser(data);
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    } catch (e) {
      fail(`the link did not load (${e.message.split('\n')[0]})`);
    }

    // Wait for the artifact frame, or detect a login / bot check.
    const deadline = Date.now() + timeoutMs;
    let frame = null;
    while (Date.now() < deadline) {
      const candidates = page.frames().filter(isArtifactFrame);
      if (candidates.length) {
        // Prefer the frame with the most content (the artifact, not a helper frame).
        let best = null; let bestSize = -1;
        for (const f of candidates) {
          const size = await f.evaluate(() => document.documentElement.outerHTML.length).catch(() => -1);
          if (size > bestSize) { best = f; bestSize = size; }
        }
        if (best && bestSize > 500) { frame = best; break; }
      }
      const title = (await page.title().catch(() => '')) || '';
      const pageUrl = page.url();
      if (/just a moment/i.test(title)) fail('claude.ai showed a bot check. Scripts cannot pass it - use Claude Code\'s own link reading, or Download the artifact file.');
      if (/\/login|\/signin|accounts\.google/i.test(pageUrl)) fail('this link needs a claude.ai login. Use Claude Code\'s own link reading (signed in with /login), or Download the artifact file.');
      await page.waitForTimeout(500);
    }
    if (!frame) fail('no artifact frame appeared on the page - the link may be private, expired, or not an artifact.');

    await frame.waitForLoadState('load', { timeout: 15000 }).catch(() => {});
    let html = '';
    let method = 'original';
    try {
      const res = await context.request.get(frame.url(), { timeout: 20000 });
      const type = res.headers()['content-type'] || '';
      if (res.ok() && /html/i.test(type)) html = await res.text();
    } catch { /* fall back below */ }
    if (!html || html.length < 500) {
      html = await frame.content();
      method = 'rendered';
    }

    fs.mkdirSync(out, { recursive: true });
    const file = path.join(out, 'artifact.html');
    fs.writeFileSync(file, html);
    fs.writeFileSync(path.join(out, 'artifact.meta.json'), JSON.stringify({
      url, frameUrl: frame.url(), method, bytes: Buffer.byteLength(html), fetchedAt: new Date().toISOString(),
    }, null, 2));
    const kb = Math.round(Buffer.byteLength(html) / 1024);
    console.log(`✔ saved ${path.basename(file)} (${kb} KB, ${method === 'original' ? 'original source' : 'rendered page - scripts already ran'})`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  const msg = e instanceof FetchError ? e.message : e.message.split('\n')[0];
  console.log(`✖ could not get the source: ${msg}`);
  process.exitCode = 1;
});
