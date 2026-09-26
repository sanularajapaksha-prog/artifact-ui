# artifact-parity

Turn a claude.ai artifact into real UI in your own project - measured, not eyeballed.

Give Claude Code an artifact link and, in plain words, what to build and where. The plugin builds the same UI in your codebase (or enhances the matching component you already have), measures fonts, spacing, colors, transparency, theme, hover states and motion against the artifact, and fixes the differences in up to three passes.

This repository is a Claude Code plugin marketplace named **artifact-tools** with one plugin, **artifact-parity**.

## Requirements

- **Claude Code, signed in with a Claude account.** The plugin runs inside Claude Code, and it reads claude.ai artifact links through your Claude login. Without a Claude account it can't run.
- **Node.js** (a current LTS version) for the helper scripts. The first build installs Playwright and a browser into the plugin's own data folder, not your project (about 150 MB); if that download is blocked, it uses Microsoft Edge or Google Chrome already on your computer.
- **Optional:** Git in your project (for the frontend-only check), Docker (only if your frontend is built into a container), and `npx` (to install a missing skill from skills.sh when you choose to).

## Install

**Ask Claude to do it:** give Claude Code this repository's link and say "Read the README and install this plugin." The steps below are written so Claude can follow them as they are.

1. Add the marketplace:

   ```
   claude plugin marketplace add sanularajapaksha-prog/artifact-ui
   ```

2. Install the plugin:

   ```
   claude plugin install artifact-parity@artifact-tools
   ```

3. Check that it's installed - `artifact-parity@artifact-tools` should be in the list:

   ```
   claude plugin list
   ```

4. **Restart Claude Code.** The plugin's helper agent only loads when a session starts. After the restart, type `/` and check that `artifact-parity:build` appears.

Inside a Claude Code session, steps 1 and 2 are also available as `/plugin marketplace add sanularajapaksha-prog/artifact-ui` and `/plugin install artifact-parity@artifact-tools`. There is nothing else to set up: the first build installs its browser tooling by itself.

## Use

```
/artifact-parity:build <artifact link or file> <what to build and where, in plain words>
```

Examples:

```
/artifact-parity:build https://claude.ai/code/artifact/xxxx
/artifact-parity:build https://claude.ai/code/artifact/xxxx only the pricing cards, on the dashboard page
/artifact-parity:build ./design/checkout.html apply it to the checkout page
```

With no description the whole artifact is built. Name a part ("only the pricing cards") to build just that part, and a place ("on the dashboard page") to say where it goes.

### How a run goes

1. **Analyze - no questions.** It finds your app, framework and dev server, and - if your frontend is built into a Docker container - that container. It reads the artifact, including parts that only show after a click (a tab, a mode, an open panel), and finds where the design should go.
2. **Your answers - the only stop.** It asks everything at once, each question with a recommended option: where the design goes, which part, how to sign in (only if your app has a login), any missing skills, whether to rebuild the container for the final check, and what to do if something unexpected comes up at the end.
3. **Build to the end.** It builds, measures and fixes in up to three passes, rebuilds the container if you said so, and reports the score - plus any "Decisions I made" on its own, so you can undo them. It stops again only for a real blocker, such as a failed login or a build error it can't fix inside your frontend.

### What it promises

- **One-to-one copy** of the artifact's markup, classes, styles and values - not your project's look-alikes.
- **Enhance, don't duplicate:** when a component at the place you name already matches the design, it is changed in place - same file, same logic, data and handlers. Otherwise the design is built new at that place.
- **Frontend only:** it changes files only inside your frontend app, plus its own `design-ref/` folder. A git snapshot taken before building proves it at the end; anything changed outside is reverted or listed, as you chose. A design that needs a new API field is reported as "needs backend" instead of being built.
- **Honest numbers:** every score comes straight from the measuring script. Parts that only show in an app state the measured page isn't in (for example a halo that shows only while a job is running) are listed as "state not reached", outside the score.
- **Works in any project:** nothing is hardcoded. Anything you state - for example "the frontend runs in the web container" or "it's served at http://localhost:8080" - wins over detection and is remembered in `design-ref/.parity-project.json`.

### Signing in

Only when a login gate is found: a login page, a password field, or a "Sign in with ..." screen. You choose how:

- a browser window where you log in yourself (recommended)
- an env file you name
- an env file found by searching the project (only key names are shown, never values)
- the plugin's own login file - an empty file only you can open, which you fill in your editor and which is deleted right after the login

Credentials never go through the chat. The saved session (never the password) is kept in the plugin's data folder, not in your project.

### What it measures

Fonts (family, weight, web font loaded), font size, line-height, letter-spacing, text, colors, borders, radius, padding, margin, size, shadows, opacity, transforms, theme variables (light and dark), flex and grid layout, positions inside the part, hover states, keyframe and JS animations, transitions, and `::before`/`::after` pseudo-elements (rings, halos, shimmers). Screen sizes 1440, 768 and 390, plus 1440 dark when the artifact has a dark theme. Colors must match exactly; pixel values within 0.5px.

### Watch progress

Every run prints one line per stage, for example:

```
━━ [1/9] Preflight ✔ 4s — scripts ok
━━ [4/9] Your answers ✔ — 5 answers saved
━━ [6/9] Pass 1 build ✔ 6m 02s — 97% (563/580) · 9 rows to fix
━━ [9/9] Finish ✔ — 100% CLEAN (580/580) · total 14m 20s
```

The same lines, with times, are kept in `design-ref/progress.md` in your project. For a live status bar at the bottom of Claude Code, run `/artifact-parity:statusbar on` (it asks first, backs up your settings, and won't replace a status bar you already have unless you say yes; `/artifact-parity:statusbar off` puts everything back).

### Pick skills for any task

```
/artifact-parity:scout <what you want to do>
```

Scout picks your installed skills for each part of a task. When a part has no matching skill, it can search skills.sh and install the one you pick - never anything you didn't pick.

## Update

```
claude plugin marketplace update artifact-tools
claude plugin update artifact-parity@artifact-tools
```

Then restart Claude Code.

## Uninstall

```
claude plugin uninstall artifact-parity@artifact-tools
claude plugin marketplace remove artifact-tools
```

Each project keeps its build notes in `design-ref/`; delete that folder if you don't need it.

## Troubleshooting

- **`/artifact-parity:build` isn't listed:** restart Claude Code; plugin agents load when a session starts.
- **Broken symbols in the progress lines:** set the environment variable `PARITY_ASCII=1` for plain-text output.
- **The browser download is blocked** (for example by a proxy): the plugin uses Microsoft Edge or Google Chrome instead. If neither is installed, install one, or allow the Playwright download.
- **The artifact link can't be read:** open the artifact in claude.ai, download it, and pass the file path instead of the link.

## Limitations

- Focus and active states aren't measured yet.
- Parts that appear only after typing, dragging or a long hover can't be captured; parts behind clicks can.

## Working on the plugin itself

- [CLAUDE.md](CLAUDE.md) - what this repository is and the rules that hold it together
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - the three layers, data flow diagrams and every file contract
- [docs/DECISIONS.md](docs/DECISIONS.md) - why each rule exists; read the entry before changing a rule
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) - the edit loop, testing, the release checklist and what's next
- [CHANGELOG.md](CHANGELOG.md) - version history

## License

MIT - see [LICENSE](LICENSE).
