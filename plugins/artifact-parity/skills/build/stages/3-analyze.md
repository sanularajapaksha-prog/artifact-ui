# Stage 3 - Analyze (no questions)

Run `progress.mjs start 3`.

Gather every fact the run needs, so stage 4 can ask the user everything at once and stages 5-9 can run without stopping. **Ask nothing here and change nothing in the app's code.** Where something needs the user's choice, record the candidates and your recommendation in `analysis.json`; stage 4 turns them into questions. Run `progress.mjs sub 3 --note "<what>"` as each part below begins.

## 1. The app

```
node "<ROOT>/scripts/detect-project.mjs" --project "." [user-stated values as flags]
```

- **What the user states wins.** If the BRIEF states any of these, pass it as a flag; detection fills in the rest and remembers it:

| The user says, for example | Flag |
|---|---|
| "the frontend runs in the acme-web container" | `--container acme-web` (alone gives the service, app folder and rebuild commands) |
| "the service is web" | `--service web` |
| "the app is in apps/admin" | `--app apps/admin` |
| "it's served at http://localhost:8080" | `--url http://localhost:8080` |
| "start it with pnpm dev:local" / "dev server on :3001" | `--dev-command "pnpm dev:local"` / `--dev-url http://localhost:3001` |
| "rebuild with ./scripts/build-fe.sh" / "restart with ..." | `--build-command "..."` / `--up-command "..."` |

- A stated value that prints ✖ (not found): record it under `problems` for stage 4; don't guess a replacement.
- **Several apps listed:** pick the one the BRIEF points to (the one containing the named screen) and rerun with `--app`. If it's unclear, record the apps as `app.candidates`.
- Read the app's `package.json` (the lockfile only if exact versions matter): framework and router, Tailwind major version, CSS approach, component library, animation and icon libraries.

## 2. The place

Search the router config or pages folder, component file names, page titles, headings and nav labels for the place the BRIEF names (with no place named, use the artifact's title and headings).

- Record up to 3 **place candidates**, best first. Each: `mode` (`enhance` when an existing component there matches the artifact, else `new`), `file`, `route`, a real `url` on the dev server (for a route with `:id`, open the list page and take a real link; if none, leave `url` empty and say so), and a one-line `why`.
- A candidate outside `app_dir` is not allowed; leave it out.

## 3. The reference, in the right state

```
node "<ROOT>/scripts/capture.mjs" --data "<DATA>" --mode ref --target "<source_file>" --out "design-ref/<screen>"
```

- Read `ref-map.md` (not `ref.json`). If the part the BRIEF names isn't there, or the BRIEF names a mode or tab ("timeline tab", "preview mode"), find the control under **State controls** that shows it and capture again with `--click "<control text or #id>"` (repeat for several clicks, in order). The last capture must be the state you recommend.
- Record `states`: each state you captured (its clicks and what it shows), and `recommended_clicks`.

## 4. The part

From the **Parts** list and the element lines in `ref-map.md`, record up to 3 **part candidates**, best first:

- the smallest named part holding everything the BRIEF names (for example `step-tracker [r-023..r-055 · 33]`) - never its page-wide wrapper
- a bigger alternative (its wrapper, or its whole section) and, if the BRIEF names no part, `all`
- each with `elements` (a range) or `sections`, its `count`, and a one-line `why`

## 5. Skills

Follow `<ROOT>/skills/scout/SKILL.md` Steps 1-4 (list installed skills and match), with these parts: the UI framework, the styling system with its major version, **motion whenever the artifact moves at all** (search the source for `@keyframes`, `animation`, `transition`, animated `::before`/`::after`, animation libraries; name the part by what it uses and how this project must write it, for example `animation: CSS @keyframes loops on ::after in React + Tailwind v4`), and the icon library.

- Implementation skills only; never design-taste skills.
- Record matched skills under `skills.chosen` (name and `SKILL.md` path).
- For each part with no match, run scout's Step 5b search (steps 1-2 only: search and pick up to 3 candidates; **don't install**) and record them under `skills.missing` with install counts and skills.sh links.

## 6. Libraries

If the artifact uses a library the app lacks (same icon set, same animation library), record it under `libraries` with why it's needed. Don't install.

## 7. Dev server and login

- Start the detected dev command in the background from `app_dir`, or reuse it if it's already running, and check the recommended place's `url` loads.
- Probe for a login, on the dev URL and (if Docker was detected) on the Docker URL:

```
node "<ROOT>/scripts/capture.mjs" --data "<DATA>" --mode probe --target "<url>"
```

- If either says `login needed`, also list env files with login key pairs (names only):

```
node "<ROOT>/scripts/capture.mjs" --data "<DATA>" --mode env-search --target "."
```

- Record `login`: the probe result per URL, the env pairs found, and `user.loginEnv` from `design-ref/.parity-project.json` as "used last time".

## 8. End of run

- **Docker:** from `design-ref/.parity-project.json`: container, service, compose project, detected URL, and `user.urls` (confirmed before, newest first). Record them under `docker` (or `null`).
- **Leftovers:** if an earlier run of this screen created a separate component that this run replaces, record each path, whether anything still imports it, and whether git tracks it (`git status --porcelain -- <path>`).

## 9. Write the analysis

Write `design-ref/<screen>/analysis.json`:

```
{
  "app":       { "dir": "...", "framework": "...", "candidates": [] },
  "places":    [ { "mode": "enhance", "file": "...", "route": "...", "url": "...", "why": "..." } ],
  "states":    [ { "clicks": [], "shows": "..." } ],
  "recommended_clicks": [],
  "parts":     [ { "elements": "r-023..r-055", "label": "step-tracker", "count": 33, "why": "..." } ],
  "skills":    { "chosen": [ { "part": "...", "skill": "...", "path": "..." } ],
                 "missing": [ { "part": "...", "candidates": [ { "id": "owner/repo@skill", "installs": "15.1K", "url": "..." } ] } ] },
  "libraries": [ { "name": "...", "why": "..." } ],
  "login":     { "dev": "open | login needed", "docker": "open | login needed | n/a", "env_pairs": [], "last_env": null },
  "docker":    { "container": "...", "service": "...", "url": "...", "last_urls": [] },
  "leftovers": [ { "path": "...", "imported": false, "tracked": true } ],
  "problems":  []
}
```

Lists are best-first; leave a list empty when nothing applies.

**On success:** run `progress.mjs done 3 --note "<n> things to confirm"` (n = the questions stage 4 will ask). Add to NOTES: `analysis`, `screen`, `app_dir`, `stack`, `source_file`.
