# Stage 4 - Your answers (the run's one stop)

Run `progress.mjs start 4`, then read `design-ref/<screen>/analysis.json`.

This is the only planned stop of the run. Ask here everything stages 5-9 would otherwise stop for, so the user can walk away after answering.

## A. Called without `ANSWERS:` - build the questions

Ask only what applies, in this order, at most 8 questions. Each question has 2-4 options; **put your recommendation first and end its label with "(Recommended)"**. The user can always pick "Other" and type, so never add an "Other" option yourself.

| id | Ask when | Question and options |
|---|---|---|
| `app` | `app.candidates` is not empty | "Which app is this for?" - the candidate folders |
| `place` | always | "Where should the design go?" - the `places` (each `Enhance <file> (<route>)` or `Build new at <file / route>`, with its `why` as the description). With only one place, add `Build new at <conventional location>` as the second option |
| `part` | always | "Which part should I build?" - the `parts`, each `<label> [<range> · <count>]` plus `after "<clicks>"` when a state click is needed |
| `login` | `login.dev` or `login.docker` is `login needed` | "The page needs a login. How should I sign in?" - exactly these four: `Open the login window` (you log in yourself in a browser window) · `Use an env file` (description: "last time: <last_env>", or "pick Other and type the path") · `Search the project's env files` (description: the pairs found, names only, or "none found") · `Use the plugin's login file` (description: "open <login file path>, fill PARITY_LOGIN_USER and PARITY_LOGIN_PASS, save, then pick this - only you can open it, and it is deleted right after the login") |
| `skill-1`, `skill-2` | a part in `skills.missing` (one question each, at most 2) | "No installed skill covers <part>. Install one?" - up to 3 candidates `owner/repo@skill · <installs>` (skills.sh link as description) and `Skip this part` |
| `libs` | `libraries` is not empty | "The artifact uses <libraries>, which the app lacks. Install them?" - `Install <names>` / `Don't install` |
| `docker` | `docker` is not null | "At the end, rebuild container <container> and check the design there?" - `Rebuild <container> · check at <url>` (the newest of `last_urls` - say "used last time" - else the detected URL) / `Rebuild · check at <other known url>` when there is one / `Skip the Docker check` |
| `leftovers` | `leftovers` is not empty | "An earlier run left <paths>. Delete them at the end?" - `Keep them` / `Delete them` (say which are untracked and can't be recovered, and never recommend deleting one that is still imported) |
| `end` | always, unless the 8 are used up | "If something unexpected comes up at the end:" - `Revert any change outside the frontend · accept app-state rows (Recommended)` / `Ask me at the end` / `Keep changes outside the frontend · accept app-state rows` |

- Fill every `<...>` with real values from `analysis.json`; the user must be able to answer without looking anything up.
- `problems` from analysis (a stated value not found): turn each into its own question naming exactly what wasn't found.
- **Before returning the questions, when `login` will be asked,** create the plugin's login file so its path can go in the option (it is outside every project, readable only by the user, and starts empty):

```
node "<ROOT>/scripts/capture.mjs" --data "<DATA>" --mode login-file --target "<the url that needs the login>"
```

- Never offer to take a username or password through the chat: typed credentials would stay in the chat history on disk.
- Over 8: drop `end` first (use its recommended option and add it to NOTES `decisions`), then `libs` (don't install).

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

Turn each `[id] answer` into `design-ref/<screen>/answers.json`. A typed ("Other") answer is read for what it says - a path, a place, a port.

```
{
  "app": "<dir or null>",
  "place": { "mode": "enhance | new", "file": "...", "route": "...", "url": "...", "typed": null },
  "part": { "elements": "r-023..r-055", "sections": null, "clicks": ["#tabTimeline"] },
  "login": { "method": "none | window | env | env-search | login-file", "env": null, "user_key": null, "pass_key": null },
  "skills": [ { "part": "...", "install": "owner/repo@skill | skip" } ],
  "libraries": "install | skip | n/a",
  "docker": { "rebuild": true, "url": "http://localhost:8080" },
  "leftovers": "keep | delete | n/a",
  "outside_frontend": "revert | ask | keep",
  "state_not_reached": "accept | ask"
}
```

- **Never write a username or password anywhere.** If a typed answer contains credentials anyway, don't use or repeat them: set `login.method` to `login-file` and add a decision telling the user to put them in the login file instead.
- An `env` answer without a path: leave `login.method` as `env`; stage 5 treats it as a blocker and asks for the path.
- Unanswered or unclear: use that question's recommended option and add it to NOTES `decisions`.

Run `progress.mjs done 4 --note "<n> answers saved"`. Add to NOTES: `answers`, and the chosen `mode`, `target_files` or `target`, `preview_url` (the chosen place's `url`), `clicks`.
