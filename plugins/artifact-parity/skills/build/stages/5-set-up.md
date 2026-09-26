# Stage 5 - Set up (apply the answers, no questions)

Run `progress.mjs start 5`, then read `design-ref/<screen>/answers.json` and `analysis.json`. Apply the answers in this order, running `progress.mjs sub 5 --note "<what>"` as each begins. Don't ask anything: only the blockers listed in the worker's rules may stop the run.

## 1. App and place

- `answers.app` set: rerun `detect-project.mjs --app "<dir>"`.
- `answers.place` from a candidate: use it. A typed place: search for it as stage 3 did. **Blocker** if nothing matches, or if it lies outside `app_dir`.
- `enhance`: `target_files` = the place's files, `preview_url` = its `url`. `new`: `target` = the place; `preview_url` = a temporary preview route (for example `/parity/<screen>`) that renders only this screen, with no app header, sidebar or login gate.

## 2. Reference state and scope

- If `answers.part.clicks` differ from the clicks of the last reference capture, capture the reference again with them:

```
node "<ROOT>/scripts/capture.mjs" --data "<DATA>" --mode ref --target "<source_file>" --out "design-ref/<screen>" [--click "<each click>" ...]
```

- Write `design-ref/<screen>/scope.json` (allowed keys only: `brief`, `sections`, `elements`, `clicks`, `build_clicks`, `note`):

```
{ "brief": "<the user's words>", "elements": ["<answers.part.elements>"], "clicks": ["<answers.part.clicks>"], "build_clicks": [] }
```

  Use `"sections"` instead of `"elements"` only when the chosen part is a whole section (or `"all"`).
- **`build_clicks`:** the clicks that bring the built page into the same state. `new` mode: usually the same texts as `clicks`. `enhance` mode: the real app's own control (its text or selector), or `[]` if `preview_url` already opens in that state. Decide it yourself by opening `preview_url`; add it to NOTES `decisions` when it isn't obvious.

## 3. Login (only if `answers.login.method` isn't `none`)

Log in on each URL that needs it (the dev URL, and the Docker URL when Docker is rebuilt at the end), using the chosen method:

- `window`: `capture.mjs --mode login --target "<url>"` - the user logs in in the browser window. The user answered moments ago, so they are still there.
- `env`: `capture.mjs --mode login --target "<url>" --env "<path>"` (plus `--user-key` / `--pass-key` if stage 3 found several pairs in that file).
- `env-search`: the same with the file and keys shown in the chosen option.
- `login-file`: `capture.mjs --mode login --target "<url>" --login-file --keep-login-file` for every URL but the last; the last one without `--keep-login-file`, so the file is deleted once all logins are done.

Then probe each URL again (`--mode probe`); it must print `open`. A login that fails, or a probe still saying `login needed`, is a **blocker**: run `progress.mjs wait 5 --note "login failed"` and return `needs-user` with the one-line reason and the four login options from stage 4. After an `env` login succeeds, remember the path (never the values): `detect-project.mjs --login-env "<path>"`.

## 4. Skills and libraries

- For each `answers.skills` entry with an `owner/repo@skill`: install it (scout Step 5b, steps 4-5: `npx -y skills add <owner/repo@skill> -g -y -a claude-code`, then check it's listed). If it fails, try that part's next candidate from `analysis.json`; if none works, skip the part and add a decision. `skip`: save `"skip"` for that part as scout describes.
- `answers.libraries` is `install`: install them from `app_dir` with the app's own package manager (only the frontend's package files change). If the install fails, continue without them and add a decision.
- Add `skills` to NOTES: `name = path to its SKILL.md` for every chosen and installed skill.

## 5. Dev server, remembered choices, frontend baseline

- Make sure the dev server runs and `preview_url` loads.
- `answers.docker.rebuild` with a URL: remember it with `detect-project.mjs --url "<url>"`.
- Snapshot the git state so stage 9 can prove the run stayed inside the frontend:

```
node "<ROOT>/scripts/scope-guard.mjs" --save --app "<app_dir>" --out "design-ref/<screen>"
```

## On success

Run `progress.mjs done 5 --note "<mode>: <target> · <skills installed or none> · <login method or no login>"`. Add to NOTES: `mode`, `app_dir`, `stack`, `dev_command`, `preview_url`, `target_files` or `target`, `scope_file`, `in_scope_elements`, `clicks`, `build_clicks`, `skills`, `docker`, `login`, `leftovers`, `decisions`.
