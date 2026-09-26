# Stage 3 - Understand the target project

Run `progress.mjs start 3`.

## 1. Detect how the app runs

```
node "<ROOT>/scripts/detect-project.mjs" --project "." [user-stated values as flags]
```

- It finds the UI app, its framework, dev command and URL, and - when a compose service builds that app - the Docker service, container, rebuild commands and the URL the container is served on. It saves all of it to `design-ref/.parity-project.json`.
- **What the user states wins.** If the BRIEF or any user answer states one of these, pass it as a flag; detection fills in everything else around it, and the value is remembered for later runs:

| The user says, for example | Flag |
|---|---|
| "the frontend runs in the acme-web container" | `--container acme-web` (this alone gives the service, app folder and rebuild commands) |
| "the service is web" | `--service web` |
| "the app is in apps/admin" | `--app apps/admin` |
| "it's served at http://localhost:8080" | `--url http://localhost:8080` |
| "start it with pnpm dev:local" / "dev server on :3001" | `--dev-command "pnpm dev:local"` / `--dev-url http://localhost:3001` |
| "rebuild with ./scripts/build-fe.sh" / "restart with ..." | `--build-command "..."` / `--up-command "..."` |

  If a stated value turns out wrong (the script prints ✖), tell the user exactly what was not found and ask for the right value; never silently fall back to a guess. To drop remembered values, run with `--forget`.
- **Several apps listed:** pick the one the BRIEF points to (the one that contains the named screen). If that is unclear, run `progress.mjs wait 3 --note "which app?"` and return STATUS `needs-user` with the apps as options. Then rerun with `--app "<folder>"`.
- Never reuse commands, ports or paths from another project; always use what this project's detection says.

## 2. Read the app

Read the app's `package.json`, and the lockfile only if exact versions matter. Note:

- the framework and the router
- Tailwind and its major version
- the CSS approach and any component library
- animation libraries (framer-motion / motion, gsap) and the icon library

## 3. Decide where the design goes, then confirm it with the user

**Find the place.** Search the router config or pages folder, component file names, page titles, headings and nav labels for the place the BRIEF names (for example "the orders dashboard"). With no place in the BRIEF, use the artifact's own title and headings to look for the matching screen.

**Pick the mode:**

- **`enhance`** - an existing component at that place matches the artifact (same screen or the same kind of UI). The artifact's design is applied **to that component**:
  - Record `target_files` (the component files that render it) and `target_url` (a route that shows it). If the route has a parameter such as `:id`, open the app's list page and take a real link; if there is none, ask.
  - **Never create a parallel component, a copy of the screen, or a new folder for it.** Its logic, data, props and handlers stay; its markup and styles change to the artifact's, and artifact parts it lacks are added inside it.
- **`new`** - nothing at that place matches. Build a new component at the place the BRIEF names (a page, route or folder), or, with no place named, by the project's conventions. Record `target`.

**Always confirm before building.** Run `progress.mjs wait 3 --note "confirm the place"` and return STATUS `needs-user`:

- `enhance`: "I'll enhance <component> (<file>, shown at <route>) with the artifact's design, keeping its logic and data. OK?"
- `new`: "Nothing at <place> matches this design, so I'll build it new at <file / route>. OK?"
- Options: `Yes, build there` / up to 2 other candidates you found (each `file · route`) / `Somewhere else`.
- When resumed: "yes" or a candidate → continue with that place. "Somewhere else" or a typed answer → search again for what the user named and confirm again.
- If nothing could be found for the named place, ask instead: "I couldn't find <place> in this project. Which file or page is it?"

## 4. Where measuring happens (`preview_url`)

- **`new` mode:** mount the screen on a temporary preview route (for example `/parity/<screen>`) that renders only this screen, with no app header, sidebar, or login gate. `preview_url` is that route.
- **`enhance` mode:** `preview_url` is `target_url` itself, on the dev server. Compare is scoped by section, so the app's header and sidebar don't shift the numbers.

## 5. Login

Check whether `preview_url` needs a login:

```
node "<ROOT>/scripts/capture.mjs" --data "<DATA>" --mode probe --target "<preview_url>"
```

- It prints `open`, or `login needed`. On `login needed`, run `progress.mjs wait 3 --note "log in once"` and return STATUS `needs-user`: "The page needs a login. How do you want to sign in?" with exactly these three options (the env options are optional conveniences; never pick one for the user):
  - `Open the login window` - "A browser window opens; you log in there yourself."
  - `Use an env file I give` - "Type the path of an env file that holds the login." If `design-ref/.parity-project.json` has `user.loginEnv`, add "(last time: <that path>)" to this description.
  - `Search the project's env files` - "I look for env files with a login user/password and you pick one."
- When resumed:
  - **Login window:**

```
node "<ROOT>/scripts/capture.mjs" --data "<DATA>" --mode login --target "<preview_url>"
```

  - **Env file I give** (a typed path, or "last time"): run the login with `--env "<path>"` (command below). If it prints `can't tell which keys`, ask which user and password keys to use (list the key names it printed as options) and rerun with `--user-key` and `--pass-key`.
  - **Search:**

```
node "<ROOT>/scripts/capture.mjs" --data "<DATA>" --mode env-search --target "."
```

    It prints `file · USER_KEY / PASS_KEY` lines, names only. Return STATUS `needs-user`: "Which login should I use?" with up to 4 of those lines as options plus `Open the login window`. If none were found, say so and offer `Open the login window` / `Use an env file I give`. On a pick, run the login with that file and keys.

```
node "<ROOT>/scripts/capture.mjs" --data "<DATA>" --mode login --target "<preview_url>" --env "<path>" [--user-key <KEY> --pass-key <KEY>]
```

  - After an env login succeeds, remember the path (never the values): `detect-project.mjs --login-env "<path>"`. If the env login fails, show its one-line reason and ask the same three options again.
- Never print, log or copy credential values; refer to them only by key name. The saved session (never the password) lives in the plugin data folder; every later capture on that site uses it.

## 6. Libraries, dev server, leftovers

- **Missing libraries:** if the artifact uses a library the project lacks (same icon set, same animation library), the right fix is to install that same library rather than hand-recreating its output. Never install without the user's yes:
  1. Run `progress.mjs wait 3 --note "install <library>?"`.
  2. Return STATUS `needs-user`. The QUESTION names the library and why it is needed. Options: `Install it` / `Don't install`.
  3. When resumed with the answer, run `progress.mjs start 3` and continue.
  4. Install it from `app_dir` with the app's own package manager, so only the frontend's package files change.
- **Dev server:** start the detected dev command in the background from the app folder, or reuse it if it is already running. Check that `preview_url` loads.
- **Leftovers:** if an earlier run of this screen created a separate component that this run replaces (for example a folder built before enhance mode existed), list those paths in NOTES as `leftovers`. Do not delete them here; stage 9 asks.

## 7. Frontend-only baseline

The build may change files only inside `app_dir` (and `design-ref/`). The confirmed place must be inside `app_dir`; if it isn't, say so and ask again. Before anything is built, snapshot the git state so stage 9 can prove it:

```
node "<ROOT>/scripts/scope-guard.mjs" --save --app "<app_dir>" --out "design-ref/<screen>"
```

## On success

1. Run `progress.mjs done 3 --note "<framework>, <styling> · <mode>: <target file or new location>"`.
2. Add these to NOTES: `mode`, `app_dir`, `stack`, `dev_command`, `preview_url`, `target_files` (enhance) or `target` (new), `docker` (service and served URL, or none), `login` (yes/no), `libraries`, `leftovers`.
