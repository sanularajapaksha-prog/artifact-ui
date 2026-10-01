# Stage 4 - Your answers (the run's one stop)

Run `progress.mjs start 4`, then read `design-ref/<screen>/analysis.json`.

This is the only planned stop of the run. Ask here everything stages 5-9 would otherwise stop for, so the user can walk away after answering.

## A. Called without `ANSWERS:` - build the questions

Ask only what applies, in this order, at most 8 questions. Each question has 2-4 options; **put your recommendation first and end its label with "(Recommended)"** (a multi-select question's labels stay exactly as written: the user ticks what applies). The user can always pick "Other" and type, so never add an "Other" option yourself.

| id | Ask when | Question and options |
|---|---|---|
| `app` | `app.candidates` is not empty | "Which app is this for?" - the candidate folders |
| `place` | always, unless a design BRIEF answers it (below) | "Where should the design go?" - the `places` (each `Enhance <file> (<route>)` or `Build new at <file / route>`, with its `why` as the description). With only one place, add `Build new at <conventional location>` as the second option; with none, offer `Build new at <conventional location> (Recommended)` and `Build new at <second conventional location>` |
| `part` | always, unless a design BRIEF answers it (below) | "Which part should I build?" - the `parts`, each `<label> [<range> · <count>]` plus `after "<clicks>"` when a state click is needed. With only `all`, don't ask: build all of it and add a decision |
| `login` | `login.dev` or `login.docker` is `login needed` | "The page needs a login. How should I sign in?" - exactly these four: `Open the login window` (you log in yourself in a browser window) · `Use an env file` (description: "last time: <last_env>", or "pick Other and type the path") · `Search the project's env files` (description: the pairs found, names only, or "none found") · `Use the plugin's login file` (description: "open <login file path>, fill PARITY_LOGIN_USER and PARITY_LOGIN_PASS, save, then pick this - only you can open it, and it is deleted right after the login") |
| `skills` | `skills.chosen` is not empty, or a surplus conflict (below) needs a yes | "Use these skills for this build?" - a **multi-select** question (write `[skills] (multi)`): one option per chosen skill, label `<skill>`, description `<part> · <installs> installs (or "installs unknown") · <source> · "you used it before" when true`. The user ticks the ones to use. With exactly one: a normal question, `Use <skill> (Recommended)` / `Don't use it` |
| `skill-1`, `skill-2` | a part in `skills.conflicts`, then a part in `skills.missing` (one question each, at most 2 together) | Conflict: "Two skills cover <part>. Which one?" - the candidates in their recorded order, the first labelled "(Recommended)", each `<skill> · <installs> installs` with `<source>` and "you used it before" as the description, plus `No skill for this part`. Missing: "No installed skill covers <part>. Install one?" - up to 3 candidates `owner/repo@skill · <installs>` (skills.sh link as description) and `Skip this part` |
| `libs` | `libraries` is not empty | "The artifact uses <libraries>, which the app lacks. Install them?" - `Install <names>` / `Don't install` |
| `dark` | `dark.artifact` is true and `dark.app` is `none` or `class` | "The artifact has a dark theme; your app <has none / switches dark with a class, which the check can't switch>. Build and check dark mode too?" - `Light only (Recommended)` — dark mode is not built, measured or scored / `Build dark too` — the dark theme is ported and, when the app uses `prefers-color-scheme`, measured at 1440 (with class-based dark it is ported but not measured) |
| `docker` | `docker` is not null | "At the end, rebuild container <container> and check the design there?" - `Rebuild <container> · check at <url>` (the newest of `last_urls` - say "used last time" - else the detected URL) / `Rebuild · check at <other known url>` when there is one / `Skip the Docker check` |
| `leftovers` | `leftovers` is not empty | "An earlier run left <paths>. Delete them at the end?" - `Keep them` / `Delete them` (say which are untracked and can't be recovered, and never recommend deleting one that is still imported) |
| `end` | always, unless the 8 are used up | "If something unexpected comes up at the end:" - `Revert any change outside the frontend · accept app-state rows (Recommended)` / `Ask me at the end` / `Keep changes outside the frontend · accept app-state rows` |

- Fill every `<...>` with real values from `analysis.json`; the user must be able to answer without looking anything up.
- `problems` from analysis (a stated value not found): turn each into its own question, id `stated` (then `stated-2`), naming exactly what wasn't found, with 1-3 likely matches plus `Leave it out`. Problems are never dropped; they count first toward the 8.
- **Before returning the questions, when `login` will be asked,** create the plugin's login file so its path can go in the option (it is outside every project, readable only by the user, and starts empty):

```
node "<ROOT>/scripts/capture.mjs" --data "<DATA>" --mode login-file --target "<the url that needs the login>"
```

- Never offer to take a username or password through the chat: typed credentials would stay in the chat history on disk.
- **A BRIEF from `/artifact-parity:design`** (the fixed shape `build all of it · enhance <file> on <route> · light only`, or `new at <file> on <route>`; from a whole-app design, `build only the shell · enhance <file> on <route>` or `build only the <screen name> screen · click: <nav text> · enhance <file> on <route>`; parts separated by ` · `) answers some questions already. Don't ask those; save their answers and add each to NOTES `decisions`:
  - `place`, when the BRIEF says `enhance <file>` and that file exists inside `app_dir`, or `new at <file>` and that path lies inside `app_dir` (its folder may not exist yet; the build creates it). Take the mode, file and route from the BRIEF and the url from the matching `places` entry.
  - `part`, when the BRIEF says `build all of it` (part `all`), `build only the <screen name> screen` and `parts` has an entry labelled with that exact name (part = its range, clicks from the BRIEF's `click:`), or `build only the shell` and `parts` has its entry (part = its `elements`).
  - `dark`, when the BRIEF says `light only` (answer: light only).
- **Skills are never used without a yes, and nothing is installed that the user did not pick,** so `skills` is never dropped. More conflicts or missing parts than the 2 skill slots: a surplus conflict's recommended skill becomes one more option in the `skills` question (when there is room; otherwise that part gets no skill), and a surplus missing part is skipped (nothing installed). Name each in the `skills` question's text ("also: <part> → no skill") and add it to NOTES `decisions`.
- Over 8: drop `end` first (use its recommended option and add it to NOTES `decisions`), then `libs` (don't install), then `dark` (light only), then `leftovers` (keep them), then `docker` (skip the Docker check), then `skill-2` (that part gets no skill).

Run `progress.mjs wait 4 --note "<n> questions"` and return STATUS `needs-answers` with the questions.

Example for a run that enhances an order-status tracker behind a login:

```
QUESTIONS:
[place] Where should the design go?
- Enhance StepTracker.tsx (/orders/:id) (Recommended) — the tracker on the order page already shows these steps; its logic and data stay
- Build new at components/orders/StepTrackerV2.tsx — a separate component; the page keeps the old tracker until you swap it
[part] Which part should I build?
- step-tracker [r-023..r-055 · 33] after "Timeline" (Recommended) — the tracker itself, with the active-step halo
- #status-bar [r-022..r-055 · 34] after "Timeline" — the tracker plus its page-wide bar
[login] The page needs a login. How should I sign in?
- Open the login window (Recommended) — you log in yourself in a browser window
- Use an env file — pick Other and type the path
- Search the project's env files — found: .env.e2e · E2E_USER / E2E_PASS
- Use the plugin's login file — open C:\Users\you\.claude\plugins\data\artifact-parity-artifact-tools\login\login.env, fill both lines, save, then pick this - only you can open it; deleted after the login
[skills] (multi) Use these skills for this build?
- tailwind-v4 — styling: Tailwind v4 · 15.2K installs · lombiq/tailwind-agent-skills · you used it before
- tailwindcss-animations — animation: CSS @keyframes loops on ::after · 2.3K installs · josiahsiegel/claude-plugin-marketplace
[docker] At the end, rebuild container acme-web and check the design there?
- Rebuild acme-web · check at http://localhost:8080 (Recommended) — used last time
- Skip the Docker check — the final score comes from the dev server
[leftovers] An earlier run left src/components/orders/legacy-tracker. Delete it at the end?
- Keep it (Recommended) — nothing is removed
- Delete it — it's untracked, so it can't be recovered from git
[end] If something unexpected comes up at the end:
- Revert any change outside the frontend · accept app-state rows (Recommended) — no stop at the end
- Ask me at the end — the run stops once more before finishing
```

## B. Called with `ANSWERS:` - save them

Turn each `[id] answer` into `design-ref/<screen>/answers.json`. A typed ("Other") answer is read for what it says - a path, a place, a port. A multi-select answer is the ticked labels, comma-separated; `none` or nothing ticked means none of them.

```
{
  "app": "<dir or null>",
  "place": { "mode": "enhance | new", "file": "...", "route": "...", "url": "...", "typed": null },
  "part": { "elements": "r-023..r-055", "sections": null, "clicks": ["#tabTimeline"] },
  "login": { "method": "none | window | env | env-search | login-file", "env": null, "user_key": null, "pass_key": null },
  "skills": [ { "part": "...", "use": "<skill name> | none", "install": "owner/repo@skill | skip | n/a" } ],
  "libraries": "install | skip | n/a",
  "dark": "light-only | both | n/a",
  "docker": { "rebuild": true, "url": "http://localhost:8080" },
  "leftovers": "keep | delete | n/a",
  "outside_frontend": "revert | ask | keep",
  "state_not_reached": "accept | ask"
}
```

- **Never write a username or password anywhere.** If a typed answer contains credentials anyway, don't use or repeat them: set `login.method` to `login-file` and add a decision telling the user to put them in the login file instead.
- An `env` answer without a path: leave `login.method` as `env`; stage 5 treats it as a blocker and asks for the path.
- Unanswered or unclear: use that question's recommended option and add it to NOTES `decisions`. Except for `skills`, `skill-1`, `skill-2` and `libs`: there an unclear answer means don't use, skip, or don't install, never an install or a use.
- `skills`: one entry per part. A chosen skill the user ticked: `use` = its name, `install` = `n/a`. Not ticked: `use` = `none`. A conflict answer: `use` = the picked skill, or `none` for `No skill for this part`. A missing part: `install` = the picked id with `use` = its skill name, or `install` = `skip` with `use` = `none`.
- `dark`: `light-only` or `both` from the answer (or the BRIEF); `n/a` when it wasn't asked because the artifact has no dark theme or the app has media-based dark.

Run `progress.mjs done 4 --note "<n> answers saved"`. Add to NOTES: `answers`, and the chosen `mode`, `target_files` or `target`, `preview_url` (the chosen place's `url`), `clicks`, and `fonts_missing` from `analysis.json` when it is not empty.
