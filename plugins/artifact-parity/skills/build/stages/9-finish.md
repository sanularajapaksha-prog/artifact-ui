# Stage 9 - Finish (follows the stage 4 answers)

Run `progress.mjs start 9`, then read `design-ref/<screen>/answers.json`. Stage 9 runs only after every pass is done; the final score comes from the app as it is really deployed. **Every choice here was made by the user at stage 4** - follow it, don't ask again. Only a blocker (a Docker build error you can't fix inside `app_dir`, a login that fails) may stop the run.

## 1. Check the place

- **`enhance`:** the design lives in `target_files`; nothing to move.
- **`new`:** the component must be mounted at the chosen `target` (page, route or parent). Mount it there now if stage 6 didn't.
- **Remove the temporary preview route** (`new` mode only), unless the user asked for a page.
- **Keep the `data-ref` attributes.** They are harmless and let future runs re-check the screen.

## 2. Leftovers - `answers.leftovers`

- `keep` or `n/a`: leave them.
- `delete`: for each path, first check nothing still imports it (search the app for the folder or file name); a path that is still imported is kept, with a decision saying why. Delete the rest, then run the app's typecheck. List what was deleted in NOTES `deleted`.

## 3. Frontend-only check - `answers.outside_frontend`

```
node "<ROOT>/scripts/scope-guard.mjs" --check --app "<app_dir>" --out "design-ref/<screen>"
```

- `✔ only frontend files changed`, or `not in a git repo`: continue.
- `✖ … changed outside the frontend app`:
  - `revert`: run the same command with `--revert` instead of `--check` (it reverts only files that were clean before the run; files that already had the user's changes are listed for the user to fix by hand), then run the app's typecheck.
  - `keep`: continue, and list the files in NOTES `outside_frontend`.
  - `ask`: run `progress.mjs wait 9 --note "files changed outside the frontend"` and return STATUS `needs-user`: "This run changed files outside the frontend app: <files>. Revert them?" Options: `Revert them` / `Keep them`.

## 4. Rebuild with Docker and measure there - `answers.docker`

- **No Docker, or `rebuild: false`:** run `progress.mjs sub 9 --note "final check on the dev server"`, and use the last pass as the final result.
- **`rebuild: true`** (the user already approved the container and the URL at stage 4):
  1. Run `progress.mjs sub 9 --note "docker build <service>"`, then the saved `build` command from `design-ref/.parity-project.json`, from the project root. Allow up to 15 minutes.
  2. Run `progress.mjs sub 9 --note "docker restart <service>"`, then the saved `up` command.
  3. Wait until `<answers.docker.url><path of preview_url>` answers (poll every 5s, up to 3 minutes). In `new` mode, use the chosen `target` route, since the preview route is gone.
  4. Probe it (`capture.mjs --mode probe`). Stage 5 already logged in on this host when it needed one; if it still says `login needed`, that is a blocker: ask with the four login options from stage 4.
  5. Run `progress.mjs sub 9 --note "measuring the Docker build"`, then capture in `build` mode on that URL (with one `--click` per `build_clicks` entry) and compare with `--scope "design-ref/<screen>/scope.json" --pass 4` (plus `--live-data` in `enhance` mode). This compare is the final score.
- **If the Docker build or restart fails:** try once to fix the cause if it is inside `app_dir` (for example a type error in a file you changed). Otherwise it is a blocker: keep the main `error` lines, run `progress.mjs wait 9 --note "docker build failed"` and return `needs-user`: "The Docker rebuild failed: <main error line>. How should I rebuild the frontend?" Options: `Retry` / `I'll give my rebuild command` / `Skip the Docker check`. A command from the user is remembered with `detect-project.mjs --build-command "<command>"` (and `--up-command`).
- **If the Docker score is lower than the last pass:** the build differs from the dev server (for example a production CSS purge, a missing env value, or a different base path). Put the rows from `report.md` in `left_rows` with that likely cause. Do not claim the pass score as final.

## 5. App states not reached - `answers.state_not_reached`

If the final `report.md` has `state not reached` rows:

- `accept`: finish. The rows stay listed as `state not reached`, outside the score; list them in NOTES `left_rows` with the class each one needs.
- `ask`: run `progress.mjs wait 9 --note "app state not reached"` and return `needs-user`: "The design is ported, but <n> parts only show in an app state this page isn't in: <each row's element and the class it needs>. Is there a page where it's in that state?" Options: `Here is a URL` / `A click shows it` / `Accept - the design is in the code`. On a URL or click, capture and compare again there (as step 4) and use that result.

## 6. Report

1. Run `progress.mjs done 9 --from-report "design-ref/<screen>" --note "<Docker <url> | dev server>"`. The score and row count come from the last compare's `result.json` (the Docker compare, or the last pass when there is no Docker); the script adds the total time and flags a stale or earlier-pass report.
2. **NOTES:** add `files` (every file created or changed), `final_score`, `measured_on` (the Docker URL or "dev server"), `deleted` (leftovers removed, or none), `outside_frontend` (or none), `unwired` and `kept_extra` (enhance mode), `decisions` (every choice you made on your own after stage 4), and `left_rows` (from the final compare, or "none").
