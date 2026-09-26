#!/usr/bin/env node
// Detects, for any project, how its UI app runs: the app folder, framework,
// dev command and port, and - when the app is built into a Docker image -
// the compose project, service, rebuild commands and the URL it is served on.
// Writes design-ref/.parity-project.json (values marked "setBy": "user" are kept).
//
// Usage: detect-project.mjs [--project <dir>] [--app <app folder>]
// Exit codes: 0 detected (docker may be null), 1 no UI app found, 2 usage error.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  return v !== undefined && !v.startsWith('--') ? v : true;
};
const projectDir = path.resolve(typeof flag('project') === 'string' ? flag('project') : '.');
const outFile = path.join(projectDir, 'design-ref', '.parity-project.json');
const isWin = process.platform === 'win32';
const norm = (p) => { const r = path.resolve(p); return isWin ? r.toLowerCase() : r; };
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'out', 'coverage', 'bin', 'obj', 'design-ref']);

function walk(dir, depth, onFile) {
  if (depth < 0) return;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) walk(path.join(dir, e.name), depth - 1, onFile); } else onFile(path.join(dir, e.name), e.name);
  }
}

// ---------- the UI app ----------
const FRAMEWORKS = [
  ['next', 'Next.js', 3000], ['nuxt', 'Nuxt', 3000], ['@sveltejs/kit', 'SvelteKit', 5173], ['astro', 'Astro', 4321],
  ['@angular/core', 'Angular', 4200], ['react-scripts', 'Create React App', 3000], ['vite', 'Vite', 5173],
];
function appInfo(dir) {
  const pkg = readJson(path.join(dir, 'package.json'));
  if (!pkg) return null;
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const fw = FRAMEWORKS.find(([dep]) => deps[dep]);
  if (!fw) return null;
  const has = (f) => fs.existsSync(path.join(dir, f));
  const pm = has('pnpm-lock.yaml') ? 'pnpm' : has('yarn.lock') ? 'yarn' : (has('bun.lockb') || has('bun.lock')) ? 'bun' : 'npm';
  const devScript = pkg.scripts?.dev ? 'dev' : pkg.scripts?.start ? 'start' : null;
  let port = fw[2];
  const scriptPort = (pkg.scripts?.[devScript] || '').match(/(?:--port|-p)\s+(\d+)/);
  const cfg = ['vite.config.ts', 'vite.config.js', 'vite.config.mts', 'vite.config.mjs'].find(has);
  const cfgPort = cfg && fs.readFileSync(path.join(dir, cfg), 'utf8').match(/server\s*:\s*\{[^}]*?port\s*:\s*(\d+)/s);
  if (scriptPort) port = Number(scriptPort[1]); else if (cfgPort) port = Number(cfgPort[1]);
  const title = (fs.existsSync(path.join(dir, 'index.html')) && fs.readFileSync(path.join(dir, 'index.html'), 'utf8').match(/<title>([^<]*)<\/title>/i)?.[1]?.trim()) || null;
  return {
    dir, name: pkg.name || path.basename(dir), framework: fw[1], packageManager: pm,
    devCommand: devScript ? `${pm} run ${devScript}` : null, devUrl: `http://localhost:${port}`, title,
  };
}

function findApps() {
  const found = [];
  const root = appInfo(projectDir);
  if (root) found.push(root);
  walk(projectDir, 5, (file, name) => {
    if (name !== 'package.json' || path.dirname(file) === projectDir) return;
    const info = appInfo(path.dirname(file));
    if (info) found.push(info);
  });
  return found;
}

// ---------- docker ----------
function docker(args, timeout = 60000) {
  const r = spawnSync('docker', args, { encoding: 'utf8', timeout, windowsHide: true });
  return r.status === 0 ? r.stdout : null;
}
// Commands are run from bash and PowerShell alike: forward slashes, and every path in double quotes.
const q = (s) => (/[\\/:\s"]/.test(s) ? `"${s.replace(/\\/g, '/').replace(/"/g, '\\"')}"` : s);
const composeArgs = (c) => ['compose', '-p', c.project, '--project-directory', c.workingDir, ...c.files.flatMap((f) => ['-f', f])];

function composeConfig(c) {
  const out = docker([...composeArgs(c), 'config', '--format', 'json']);
  try { return out ? JSON.parse(out) : null; } catch { return null; }
}

function composeCandidates() {
  const seen = new Map();
  // 1. Stacks that are running (or were run): their labels name the exact files and project.
  const ids = (docker(['ps', '-aq']) || '').split(/\s+/).filter(Boolean);
  if (ids.length) {
    let inspected = [];
    try { inspected = JSON.parse(docker(['inspect', ...ids]) || '[]'); } catch { /* ignore */ }
    for (const c of inspected) {
      const l = c.Config?.Labels || {};
      const project = l['com.docker.compose.project'];
      const files = l['com.docker.compose.project.config_files'];
      const workingDir = l['com.docker.compose.project.working_dir'];
      if (!project || !files || !workingDir) continue;
      const key = `${project}|${files}`;
      if (!seen.has(key)) seen.set(key, { project, workingDir, files: files.split(','), source: 'running stack' });
    }
  }
  // 2. Compose files in the repo that were never started: each file on its own.
  walk(projectDir, 3, (file, name) => {
    if (!/^(docker-)?compose([.\w-]*)?\.ya?ml$/i.test(name)) return;
    const dir = path.dirname(file);
    const key = `file|${file}`;
    if (![...seen.values()].some((c) => c.files.some((f) => norm(f) === norm(file)))) {
      seen.set(key, { project: path.basename(dir).toLowerCase().replace(/[^a-z0-9_-]/g, ''), workingDir: dir, files: [file], source: 'compose file' });
    }
  });
  return [...seen.values()];
}

async function servedAt(ports, title) {
  for (const port of ports) {
    const url = `http://127.0.0.1:${port}`;
    try {
      const res = await fetch(`${url}/`, { signal: AbortSignal.timeout(3000), redirect: 'follow' });
      const body = await res.text();
      if (!/<html/i.test(body)) continue;
      const got = body.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim();
      if (!title || got === title) return url;
    } catch { /* not listening */ }
  }
  return null;
}

async function findDocker(app) {
  for (const c of composeCandidates()) {
    const cfg = composeConfig(c);
    if (!cfg?.services) continue;
    const entry = Object.entries(cfg.services).find(([, s]) => {
      const ctx = typeof s.build === 'string' ? s.build : s.build?.context;
      return ctx && norm(path.resolve(c.workingDir, ctx)) === norm(app.dir);
    });
    if (!entry) continue;
    const [service, svc] = entry;
    const ports = (s) => (s.ports || []).map((p) => p.published).filter(Boolean);
    const own = ports(svc);
    const others = Object.entries(cfg.services).filter(([n]) => n !== service).flatMap(([, s]) => ports(s));
    const base = ['docker', ...composeArgs(c)].map(q).join(' ');
    const containers = (docker(['ps', '-a', '--filter', `label=com.docker.compose.project=${c.project}`,
      '--filter', `label=com.docker.compose.service=${service}`, '--format', '{{.Names}} ({{.Status}})']) || '').trim().split(/\r?\n/).filter(Boolean);
    return {
      project: c.project, workingDir: c.workingDir, files: c.files, service, source: c.source,
      container: svc.container_name || containers[0]?.replace(/ \(.*$/, '') || null, containers,
      build: `${base} build ${service}`,
      up: `${base} up -d --no-deps --force-recreate ${service}`,
      url: await servedAt([...own, ...others], app.title),
      published: own.length ? own : null,
    };
  }
  return null;
}

async function main() {
  const prev = readJson(outFile) || {};
  let app;
  if (typeof flag('app') === 'string') {
    app = appInfo(path.resolve(flag('app')));
    if (!app) { console.log(`✖ no UI app (Next.js, Vite, CRA, Angular, SvelteKit, Nuxt, Astro) in ${flag('app')}`); process.exit(1); }
  } else if (prev.app?.setBy === 'user' || prev.app?.dir) {
    app = appInfo(prev.app.dir) || null;
  }
  if (!app) {
    const apps = findApps();
    if (!apps.length) { console.log('✖ no UI app found in this project (looked for Next.js, Vite, CRA, Angular, SvelteKit, Nuxt, Astro)'); process.exit(1); }
    if (apps.length > 1) {
      console.log(`? ${apps.length} UI apps found - rerun with --app <folder>:`);
      for (const a of apps) console.log(`  - ${path.relative(projectDir, a.dir) || '.'} (${a.name}, ${a.framework})`);
      process.exit(0);
    }
    [app] = apps;
  }
  const detectedDocker = await findDocker(app);
  const docker = prev.docker?.setBy === 'user' ? prev.docker : detectedDocker;
  const result = { app: prev.app?.setBy === 'user' ? { ...app, ...prev.app } : app, docker, detectedAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2));

  const rel = path.relative(projectDir, app.dir) || '.';
  console.log(`✔ app: ${rel} (${app.framework}, ${app.packageManager}) · dev: ${app.devCommand || 'no dev script'} at ${app.devUrl}`);
  if (!docker) console.log('· docker: none - this app is not built by any compose service');
  else {
    console.log(`✔ docker: service "${docker.service}" in compose project "${docker.project}" (${docker.source})`);
    console.log(`  container: ${docker.containers?.length ? docker.containers.join(', ') : `${docker.container || 'none'} (not created yet)`}`);
    console.log(`  rebuild: ${docker.build}`);
    console.log(`  restart: ${docker.up}`);
    console.log(docker.url ? `  served at: ${docker.url}` : '  served at: unknown - start the stack, or set docker.url in design-ref/.parity-project.json');
  }
  console.log(`  saved: ${path.relative(projectDir, outFile)}`);
}

main().catch((e) => { console.log(`✖ detect failed: ${e.message.split('\n')[0]}`); process.exit(1); });
