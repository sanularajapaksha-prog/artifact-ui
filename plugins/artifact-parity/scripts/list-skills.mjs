#!/usr/bin/env node
// Lists the Claude Code skills installed on this machine, with name, scope,
// description and SKILL.md path, so the scout skill can match them to a task.
//
// Scans: user skills, project skills, legacy commands, and skills inside
// installed plugins (read from installed_plugins.json, so old cached versions
// are not listed twice). Follows symlinks (npx skills installs symlinks).
//
// Usage: node list-skills.mjs [--project <dir>] [--json] [--include-self]
// Env:   CLAUDE_CONFIG_DIR overrides the default ~/.claude location.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SELF_PLUGIN = 'artifact-parity';
const DESC_LIMIT = 220;

const args = process.argv.slice(2);
function argValue(flag, fallback) {
  const i = args.indexOf(flag);
  if (i >= 0 && i + 1 < args.length && !args[i + 1].startsWith('--')) return args[i + 1];
  return fallback;
}
const projectDir = path.resolve(argValue('--project', '.'));
const asJson = args.includes('--json');
const includeSelf = args.includes('--include-self');
const configDir = process.env.CLAUDE_CONFIG_DIR
  ? path.resolve(process.env.CLAUDE_CONFIG_DIR)
  : path.join(os.homedir(), '.claude');

const skills = [];
const warnings = [];
const seenPaths = new Set();

function statOrNull(p) {
  try { return fs.statSync(p); } catch { return null; } // statSync follows symlinks
}
const isDir = (p) => statOrNull(p)?.isDirectory() === true;
const isFile = (p) => statOrNull(p)?.isFile() === true;

function readDirSafe(dir) {
  try { return fs.readdirSync(dir); } catch { return []; }
}

// Minimal YAML front-matter reader: top-level "key: value" pairs, quoted
// strings, block scalars (| and >), and plain values continued on indented lines.
function parseFrontMatter(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (!lines.length || lines[0].trim() !== '---') return { data: {}, body: text };
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { end = i; break; }
  }
  if (end === -1) return { data: {}, body: text };
  const data = {};
  let i = 1;
  while (i < end) {
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[i]);
    if (!m) { i++; continue; }
    const key = m[1];
    let value = m[2].trim();
    i++;
    const continuation = [];
    while (i < end && (/^\s+\S/.test(lines[i]) || lines[i].trim() === '')) {
      continuation.push(lines[i].trim());
      i++;
    }
    if (/^[|>][+-]?$/.test(value)) {
      value = continuation.join(value.startsWith('|') ? '\n' : ' ');
    } else if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    } else if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
      value = value.slice(1, -1).replace(/''/g, "'");
    } else if (continuation.length) {
      value = [value, ...continuation].join(' ');
    }
    data[key] = value.trim();
  }
  return { data, body: lines.slice(end + 1).join('\n') };
}

function firstParagraph(body) {
  for (const line of body.split(/\r?\n/)) {
    const t = line.trim();
    if (t && !t.startsWith('#') && !t.startsWith('```')) return t;
  }
  return '';
}

function addSkill({ name, scope, file, prefix = '' }) {
  const real = (() => { try { return fs.realpathSync(file); } catch { return file; } })();
  if (seenPaths.has(real)) return;
  seenPaths.add(real);
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) {
    warnings.push(`cannot read ${file}: ${e.code || e.message}`);
    return;
  }
  const { data, body } = parseFrontMatter(text);
  const description = (data.description || firstParagraph(body) || '(no description)').replace(/\s+/g, ' ').trim();
  const base = data.name || name;
  skills.push({ name: prefix ? `${prefix}:${base}` : base, scope, description, path: file });
}

// A folder of skills: each child folder holding SKILL.md is one skill.
// A child folder that is itself a plugin (skills-dir plugin) is scanned as a plugin.
function scanSkillsDir(dir, scope, prefix = '') {
  if (!isDir(dir)) return;
  for (const entry of readDirSafe(dir)) {
    const full = path.join(dir, entry);
    if (!isDir(full)) {
      let isLink = false;
      try { isLink = fs.lstatSync(full).isSymbolicLink(); } catch { /* ignore */ }
      if (isLink) warnings.push(`broken link skipped: ${full}`);
      continue;
    }
    const skillFile = path.join(full, 'SKILL.md');
    if (isFile(skillFile)) {
      addSkill({ name: entry, scope, file: skillFile, prefix });
    } else if (!prefix && isFile(path.join(full, '.claude-plugin', 'plugin.json'))) {
      scanPluginRoot(full, entry, `${scope}-plugin`);
    }
  }
}

function scanPluginRoot(root, pluginName, scope) {
  if (pluginName === SELF_PLUGIN && !includeSelf) return;
  const skillsDir = path.join(root, 'skills');
  if (isDir(skillsDir)) {
    scanSkillsDir(skillsDir, scope, pluginName);
  } else if (isFile(path.join(root, 'SKILL.md'))) {
    addSkill({ name: pluginName, scope, file: path.join(root, 'SKILL.md') });
  }
}

function scanCommandsDir(dir, scope) {
  if (!isDir(dir)) return;
  for (const entry of readDirSafe(dir)) {
    if (!entry.toLowerCase().endsWith('.md')) continue;
    const full = path.join(dir, entry);
    if (isFile(full)) addSkill({ name: entry.replace(/\.md$/i, ''), scope, file: full });
  }
}

function disabledPlugins() {
  const off = new Set();
  const settingsFile = path.join(configDir, 'settings.json');
  if (!isFile(settingsFile)) return off;
  try {
    const s = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    for (const [id, on] of Object.entries(s.enabledPlugins || {})) if (on === false) off.add(id);
  } catch (e) {
    warnings.push(`cannot parse ${settingsFile}: ${e.message}`);
  }
  return off;
}

function scanInstalledPlugins() {
  const file = path.join(configDir, 'plugins', 'installed_plugins.json');
  if (!isFile(file)) return;
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
    warnings.push(`cannot parse ${file}: ${e.message}`);
    return;
  }
  const off = disabledPlugins();
  const plugins = data && typeof data.plugins === 'object' ? data.plugins : {};
  for (const [id, entries] of Object.entries(plugins)) {
    if (off.has(id)) continue;
    const pluginName = id.split('@')[0];
    for (const entry of Array.isArray(entries) ? entries : [entries]) {
      if (entry && entry.installPath && isDir(entry.installPath)) {
        scanPluginRoot(entry.installPath, pluginName, `plugin ${id}`);
      }
    }
  }
}

scanSkillsDir(path.join(projectDir, '.claude', 'skills'), 'project');
scanCommandsDir(path.join(projectDir, '.claude', 'commands'), 'project-command');
scanSkillsDir(path.join(configDir, 'skills'), 'user');
scanCommandsDir(path.join(configDir, 'commands'), 'user-command');
scanInstalledPlugins();

if (asJson) {
  console.log(JSON.stringify({ skills, warnings }, null, 2));
} else if (!skills.length) {
  console.log('No installed skills found.');
  for (const w of warnings) console.log(`warning: ${w}`);
} else {
  console.log(`Installed skills (${skills.length}):`);
  for (const s of skills) {
    const d = s.description.length > DESC_LIMIT ? `${s.description.slice(0, DESC_LIMIT - 1)}…` : s.description;
    console.log(`- ${s.name} [${s.scope}] ${d}`);
    console.log(`  ${s.path}`);
  }
  for (const w of warnings) console.log(`warning: ${w}`);
}
