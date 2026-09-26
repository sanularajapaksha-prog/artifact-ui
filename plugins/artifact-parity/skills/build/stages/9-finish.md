# Stage 9 - Finish

Run `progress.mjs start 9`. Stage 9 runs only after every pass is done; the final score comes from the app as it is really deployed.

## 1. Check the place

- **`enhance`:** the design lives in `target_files`; nothing to move.
- **`new`:** the component must be mounted at the confirmed `target` (page, route or parent). Mount it there now if stage 6 didn't.
- **Remove the temporary preview route** (`new` mode only), unless the user asked for a page.
- **Keep the `data-ref` attributes.** They are harmless and let future runs re-check the screen.

## 2. Leftovers from earlier runs

If NOTES has `leftovers`:

1. For each path, check whether anything still imports it (search the app for the folder or file name). A path that is still imported is not a leftover; keep it and say so.
2. Check `git status --porcelain -- <path>`: tracked files can be restored from git; untracked ones cannot.
3. Run `progress.mjs wait 9 --note "delete leftovers?"` and return STATUS `needs-user`: "An earlier run created <paths>, which this run replaces. Delete them?" Mark untracked paths "(not in git - can't be recovered)". Options: `Delete them` / `Keep them`.
4. Delete only after `Delete them`, then run the app's typecheck to make sure nothing referenced them.

## 3. Frontend-only check

Before rebuilding anything, prove the run stayed inside the frontend app:

```
node "<ROOT>/scripts/scope-guard.mjs" --check --app "<app_dir>" --out "design-ref/<screen>"
```

- `✔ only frontend files changed`, or `not in a git repo`: continue.
- `✖ … changed outside the frontend app`: run `progress.mjs wait 9 --note "files changed outside the frontend"` and return STATUS `needs-user` with the listed files: "This run changed files outside the frontend app: <files>. Revert them?" Options: `Revert them` / `Keep them`.
  - `Revert them`: run the same command with `--revert` instead of `--check`. It reverts only files that were clean before the run; files that already had the user's changes are listed for the user to fix by hand. Then run the app's typecheck.
  - `Keep them`: continue, and list them in NOTES as `outside_frontend`.

## 4. Rebuild with Docker and measure there

Read `docker` from `design-ref/.parity-project.json`.

- **`docker` is null** (no compose service builds this app): run `progress.mjs sub 9 --note "no Docker service for this app - final check on the dev server"`, and use the pass results as the final score. Skip to step 5.
- **Otherwise, ask first - every run, because a restart replaces the running container:**
  1. Run `progress.mjs wait 9 --note "confirm the container"` and return STATUS `needs-user`: "Your frontend runs in container `<container>` (service `<service>`, compose project `<project>`), served at `<docker url>`. I'll rebuild it with your changes, restart it, and check the design there. OK?" Options: `Yes, rebuild <container>` / `A different container` / `Skip the Docker check`.
  2. **`A different container`:** list the project's containers (`docker ps -a --format "{{.Names}}  {{.Label \"com.docker.compose.service\"}}  {{.Status}}"`) and ask which one; then rerun `detect-project.mjs --container <picked name>` (it finds that container's service, app and rebuild commands, and remembers the pick) and ask this question again for it.
  3. Only after `Yes`: run `progress.mjs sub 9 --note "docker build <service>"`, then the saved `build` command from the project root. Allow up to 15 minutes.
  4. Run `progress.mjs sub 9 --note "docker restart <service>"`, then the saved `up` command.
  5. Wait until `<docker url><path of preview_url>` answers (poll every 5s, up to 3 minutes). In `new` mode, use the confirmed `target` route, since the preview route is gone.
  6. Probe it for a login (`capture.mjs --mode probe`). If a login is needed, ask as stage 3 does and run `capture.mjs --mode login` for this URL; the Docker host keeps its own session.
  7. Run `progress.mjs sub 9 --note "measuring the Docker build"`, then capture in `build` mode on that URL and compare with `--scope "design-ref/<screen>/scope.json" --pass 4` (plus `--live-data` in `enhance` mode). This compare is the final score.
- **If the Docker build or restart fails:**
  1. Keep the last 15 lines of its output, most of all the lines with `error`.
  2. Run `progress.mjs wait 9 --note "docker build failed"` and return STATUS `needs-user`: "The Docker rebuild failed: <main error line>. How should I rebuild the frontend?" Options: `Retry` / `I'll give my rebuild command` / `Skip the Docker check`.
  3. On a command from the user, rerun `detect-project.mjs --build-command "<command>"` (and `--up-command "<command>"` if given) so it is remembered, then run it. Later runs use it without asking.
  4. On `Skip the Docker check`, finish with the pass results and say the Docker build was not checked.
- **If the Docker score is lower than the last pass:** the build differs from the dev server (for example a production CSS purge, a missing env value, or a different base path). Put the rows from `report.md` in `left_rows` with that likely cause. Do not claim the pass score as final.

## 5. Report

1. Run `progress.mjs done 9 --score "<final score>" --note "<Docker <url> | dev server>"`. The script adds the total time.
2. **NOTES:** add `files` (every file created or changed), `final_score`, `measured_on` (the Docker URL or "dev server"), `deleted` (leftovers removed, or none), `outside_frontend` (or none), `unwired` and `kept_extra` (enhance mode), and `left_rows` (from the final compare, or "none").
