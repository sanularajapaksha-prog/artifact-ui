# CLAUDE.md — artifact-tools

Memory for anyone (human or Claude) working on this repository. Read this before changing anything.

## What this repository is

A **Claude Code plugin marketplace** named `artifact-tools`, holding one plugin, `artifact-parity`.

It is **not** an application. Almost all of it is prompt text that Claude executes at runtime, plus a
small layer of Node scripts that do the things a prompt cannot do reliably: render a page in a real
browser, read computed styles, diff numbers, and touch the filesystem.

- Remote: `https://github.com/sanularajapaksha-prog/artifact-ui.git`
- Installed locally as a **`directory` marketplace** pointing at this same folder — so an edit here is
  live after a version bump; you never have to push to GitHub to test.
- Public OSS repo. **No employer or client content may ever be committed here** — no internal URLs,
  project names, screenshots, credentials or customer code, including in examples.

## The one-paragraph architecture

`/artifact-parity:build` runs an **orchestrator** ([skills/build/SKILL.md](plugins/artifact-parity/skills/build/SKILL.md))
whose only job is to keep the user's screen clean. It does no work itself — it calls the
**`parity-worker` subagent** once per stage group, and prints back the lines the worker returns. The
worker reads one **stage file** per stage and follows it, calling the **Node scripts** to measure and
to write state. Nine stages, one planned stop for questions (stage 4), then it runs to the end.

Full detail with diagrams: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Hard rules — do not break these without reading DECISIONS.md first

Each of these exists because of a specific failure. The reasoning is in
[docs/DECISIONS.md](docs/DECISIONS.md); change one only after reading its entry.

1. **The orchestrator never does work.** It must not read files, run commands or summarize. It prints
   worker lines verbatim. Anything the orchestrator does itself lands in the user's context window.
2. **Scores come from `result.json`, never from a model's own count.** `progress.mjs done --from-report`
   exists so no model can report a number it produced itself.
3. **Ask once, at stage 4.** Stage 3 gathers facts and asks nothing. Stages 5–9 decide and record the
   choice in `decisions`; they stop only for a real blocker.
4. **Frontend only.** The worker writes inside `app_dir` plus `design-ref/`. `scope-guard.mjs` snapshots
   git before the build and proves it afterwards.
5. **Real source only.** Build from the artifact's actual markup, never from a WebFetch summary or a
   description. `check-source.mjs` is the gate.
6. **Credentials never reach the chat, a file, or NOTES.** They exist only as the environment of one
   login command. See [docs/DECISIONS.md](docs/DECISIONS.md) D7.
7. **Exact values.** No rounding, no "close enough" colors, no swapped fonts or easing curves. Colors
   must match exactly; pixel values within 0.5px.
8. **Never touch the user's `package.json`.** Playwright and the browser install into the plugin's own
   data folder.

## Where things live

```
.claude-plugin/marketplace.json        the marketplace manifest (lists the plugins)
plugins/artifact-parity/
  .claude-plugin/plugin.json           name, version, description  <- BUMP version HERE
  skills/build/SKILL.md                the orchestrator
  skills/build/stages/1..9-*.md        one file per stage; the worker reads these
  skills/scout/SKILL.md                skill matching + install (also used by stage 3)
  skills/statusbar/SKILL.md            status line on/off
  agents/parity-worker.md              the subagent that does the work
  scripts/*.mjs                        the measuring and state layer (see below)
  scripts/lib/deps.mjs                 pinned dep versions + browser launch
docs/                                  architecture, decisions, development
```

## Editing rules by file type

- **Stage files** (`stages/*.md`) are read by the worker **one stage at a time**. Keep each one
  self-contained: a stage may not rely on text that lives only in another stage file.
- **Anything a stage file tells the worker to output** must also be accepted by the orchestrator's
  reply parser in `SKILL.md`. Change both or neither.
- **Scripts** are the contract between stages. If you change a script's output shape, grep the stage
  files for its name — the stage text is its only caller.
- **`progress.mjs` owns the user-visible line format.** Do not print run status from anywhere else.

## Releasing a new version

`version` in `plugins/artifact-parity/.claude-plugin/plugin.json` is what Claude Code caches on. If you
do not bump it, your edits are ignored — the old cached copy is used. Full checklist:
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

```bash
# 1. bump "version" in plugins/artifact-parity/.claude-plugin/plugin.json
# 2. add the entry to CHANGELOG.md
git add -A && git commit -m "v0.10.0: <one line, imperative, what changed for the user>"
git tag v0.10.0
git push origin main --tags
```

Commit subjects follow the existing style: `v<version>: <sentence>` — see `git log`.

## House style for the prose

The whole plugin is prompt text a user may read, so it is written in plain English:

- No jargon where a plain word works; no "utilize", "leverage", "simply".
- Second person for the user, imperative for the worker.
- Every instruction says what to do **and** what happens when it fails.
- Unicode symbols in output always have a `PARITY_ASCII=1` fallback.
