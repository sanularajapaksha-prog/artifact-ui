# artifact-tools (Claude Code plugin marketplace)

Contains one plugin: **artifact-parity**. It rebuilds a claude.ai artifact inside your codebase, then measures the result against the artifact. It checks fonts, sizes, line-height, letter-spacing, spacing, colors, transparency, theme, icons, hover states and motion, and fixes the differences in up to 3 passes.

It also includes **scout**. Scout picks your installed skills for each part of a task. When a part has no skill, it tells you exactly what skill is needed, and can search skills.sh and install the one you pick - never anything you did not pick.

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
- **Name a place** ("apply it to the orders dashboard", "put it on the dashboard page"): the plugin finds that place in your project.
  - **A component there matches the design:** it is **enhanced in place** - same file, same logic, data and handlers; only markup and styles change to the artifact's. No copy, no new folder.
  - **Nothing there matches:** the design is **built new at that place**.
  - **Either way, you confirm the place before anything is built.**
- **Frontend only:** it changes files only inside the frontend app folder (plus its own `design-ref/` output) - never backend, Docker/compose, env or other apps. A git snapshot before building proves it at the end; anything changed outside is listed and can be reverted (your own earlier uncommitted work is never touched). A design that needs a new API field is reported as "needs backend" instead of being built.
- **Always a one-to-one copy** of the artifact, whatever you state about the place, container or URL.
- **Works in any project:** it detects the UI app, framework, dev server, and the Docker compose service and container that serve the app. Nothing is hardcoded. Anything you state yourself wins over detection and is remembered - for example "the frontend runs in the acme-web container", "it's served at http://localhost:8080", "rebuild with ./build.sh"; the rest is detected around it. Saved in `design-ref/.parity-project.json`.
- **Pages behind a login:** you choose how, each time it is needed: log in yourself in a browser window the plugin opens, give an env file path that holds the login, let it search the project's env files and pick one, or paste a username and password (used once, never saved). Only key names are ever shown, never values; the session (never the password) is kept in the plugin's data folder, and the env path you used is offered again next time.
- **Deploy port:** before the Docker rebuild it asks which URL/port to check, offering the one you used last time and the detected one.
- **Real data:** when an existing screen shows real data instead of the artifact's sample text, those elements are checked for styles only, not for text or size.
- **Finish with Docker:** after all passes, if a container serves the app, the plugin names it and asks you before it rebuilds and restarts it, then takes the final score from the Docker build.

**Ask once, then it works on its own:** the run first analyzes your project and the artifact (stage 3, no questions), then asks everything it needs in one go (stage 4): where the design goes, which part, how to sign in (only if a login gate is found), missing skills, the Docker container and port for the final check, leftovers, and what to do if something unexpected comes up at the end. After you answer, it builds to the end without stopping and reports the result - including any "Decisions I made" it took on its own. It stops again only for a real blocker (a failed login, a build error it can't fix inside the frontend).

**Signing in:** a login window you use yourself (recommended), an env file you name, one found by searching the project's env files, or the plugin's own login file - an empty file only you can open, which you fill in your editor and which is deleted right after the login. Credentials never go through the chat.

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

## Status (v0.9.0)

| Part | State |
|---|---|
| Plugin + marketplace manifests | done (step 1) |
| `skills/scout` + `scripts/list-skills.mjs` | done (step 2), works now |
| Progress lines, log, status bar | done (step 3), works now |
| Quiet mode, plain-words description, part selection | done (step 4) |
| `setup.mjs` (installs Playwright + a browser, falls back to Edge/Chrome), `fetch-public.mjs`, `check-source.mjs` | done (step 5) |
| `scripts/capture.mjs` (+ `.jsx` harness, section ids for part selection) | done (step 6) |
| `scripts/compare.mjs` (+ `--scope`, pass-3 crops) | done (step 7) |
| Enhance-in-place or build-new at the confirmed place, project detection (`detect-project.mjs`), login sessions, `--live-data`, Docker rebuild + final check with approval | done (v0.7.0) |
| Full run on a real screen | step 8 |

**Motion:** keyframe, JS and `::before`/`::after` pseudo-element animations (rings, halos, shimmers) are measured and compared. Motion is always a skill part: if no installed skill covers how this project writes it, you get the same "Find and install one" choice, before building and again if motion rows remain.

**Measured:** fonts (family, weight, web font loaded), font size, line-height, letter-spacing, text, colors, borders, radius, padding, margin, size, shadows, opacity, transforms, theme variables (light and dark), flex/grid layout, x/y inside each section, hover states, keyframe and JS animations, transitions. Screen sizes 1440, 768, 390, plus 1440 dark when the artifact has a dark theme. Colors must match exactly; px values within 0.5px.

**States:** parts that appear only after a click (a mode like Timeline, a tab, an open panel) are captured by clicking them first (`--click`, in order). `ref-map.md` lists the page's state controls, and the built page is measured in the same state.

**Honest numbers:** every stage line's score and row count come from compare's own `result.json`; a part is scoped by its exact subtree (`"elements": ["r-023..r-055"]`, listed under Parts in `ref-map.md`), not the whole section around it. If the build has an artifact rule in its CSS but the measured page isn't in the state that turns it on (for example a halo that shows only while a job is running), those rows are listed as "state not reached", kept out of the score, and you're asked for a page in that state.

**Not measured yet:** focus/active states.

**First-run download:** on the first real run, setup downloads Playwright and a browser (about 150 MB) into the plugin's data folder, not into your project. If a proxy blocks the browser download, it uses the Microsoft Edge or Google Chrome already on your PC.
