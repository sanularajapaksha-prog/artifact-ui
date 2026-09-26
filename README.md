# artifact-tools (Claude Code plugin marketplace)

Contains one plugin: **artifact-parity**. It rebuilds a claude.ai artifact inside your codebase, then measures the result against the artifact. It checks fonts, sizes, line-height, letter-spacing, spacing, colors, transparency, theme, icons, hover states and motion, and fixes the differences in up to 3 passes.

It also includes **scout**. Scout picks your installed skills for each part of a task. When a part has no skill, it tells you exactly what skill is needed. It never installs anything by itself.

## Install (one time)

1. Unzip this folder somewhere permanent, for example `C:\dev\claude-plugins\artifact-tools`.
2. In PowerShell, run the two commands below. Use forward slashes in the path.

```
claude plugin marketplace add C:/dev/claude-plugins/artifact-tools
claude plugin install artifact-parity@artifact-tools
```

   You can run the same thing inside a Claude Code session instead:

```
/plugin marketplace add C:/dev/claude-plugins/artifact-tools
/plugin install artifact-parity@artifact-tools
```

3. Restart Claude Code. Type `/` and check that `artifact-parity:build` appears in the list.

## Use

**Build from an artifact:**

```
/artifact-parity:build <artifact-link> <what you want, in plain words>
```

Examples:

```
/artifact-parity:build https://claude.ai/code/artifact/xxxx
/artifact-parity:build https://claude.ai/code/artifact/xxxx build only the pricing cards, put it on the dashboard page
```

- **No description:** the whole artifact is built.
- **Name a part** ("only the pricing cards"): only that part is built and checked. If your words match more than one section, you're asked which one.
- **Name a place** ("put it on the dashboard page"): the finished UI is placed there. Checking still happens on a private preview page, so your app's header and sidebar can't skew the numbers.

**What the chat shows:** only stage lines, questions that need your answer, and the final result. A helper agent does the file reads, commands and edits out of sight. Claude Code still shows one collapsed line per stage for it; expand it if you're curious.

**Pick skills for any task:**

```
/artifact-parity:scout <what you want to do>
```

Scout also starts on its own at the beginning of bigger tasks. Your answers ("use X" or "skip") are remembered, so it asks about each kind of part only once.

## Watch progress

Every build run prints one line per stage, for example:

```
━━ [1/9] Preflight ✔ 4s — scripts ok
━━ [2/9] Get source ✔ 12s — artifact.html (84 KB, real source)
━━ [6/9] Pass 1 build … section 3/7 "pricing cards"
━━ [6/9] Pass 1 build ✔ 6m 02s — 71% (412/580) · 9 rows to fix
━━ [9/9] Finish ✔ — 100% CLEAN · total 14m 20s
```

There are three ways to follow a run:

- **In the chat:** the stage lines above, printed at every stage.
- **In a log file:** `design-ref/progress.md` in your project keeps the same lines with times, one section per run. You can open it anytime, even after `/clear`.
- **In a live bar (optional):** a status bar at the bottom of Claude Code shows the current stage.

```
/artifact-parity:statusbar on
```

It shows something like `▸ parity · pricing-page · 6/9 Pass 1 build · section 3/7 · 6m12s`.

The status bar details:

- It asks before changing your settings.
- It backs up your settings file first.
- It won't replace a status bar you already have unless you say yes.
- `/artifact-parity:statusbar off` puts everything back.

If your terminal shows broken symbols, set the environment variable `PARITY_ASCII=1` for plain-text output.

## Update (each time you get a new version of this folder)

Claude Code installs a copy of the plugin into its cache, keyed by the version number. Each new version of this folder comes with a higher `version` in `plugin.json`.

1. Replace the folder contents with the new version.
2. Run these commands:

```
claude plugin marketplace update artifact-tools
claude plugin update artifact-parity@artifact-tools
```

3. Restart Claude Code. This is required: the helper agent only loads when a session starts.

## Status (v0.4.0)

| Part | State |
|---|---|
| Plugin + marketplace manifests | done (step 1) |
| `skills/scout` + `scripts/list-skills.mjs` | done (step 2), works now |
| Progress lines, log, status bar (`skills/statusbar`, `progress.mjs`, `statusline*.mjs`) | done (step 3), works now |
| Quiet mode, plain-words description, part selection (`skills/build`, `agents/parity-worker.md`, `skills/build/stages/`) | done (step 4) |
| `scripts/setup.mjs`, `fetch-public.mjs`, `check-source.mjs` | step 5 |
| `scripts/capture.mjs` (+ `.jsx` harness, section ids for part selection) | step 6 |
| `scripts/compare.mjs` (+ `--scope`) | step 7 |
| Full run on a real screen | step 8 |

What happens today when you run the build command: it stops at stage 1 with this line, which is expected until steps 5-7 are added.

```
━━ [1/9] Preflight ✖ failed — missing setup.mjs, fetch-public.mjs, check-source.mjs, capture.mjs, compare.mjs · update the plugin
```
