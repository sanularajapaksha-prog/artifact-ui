# Stage 3 - Understand the target project

Run `progress.mjs start 3`.

## 1. Detect how the app runs

```
node "<ROOT>/scripts/detect-project.mjs" --project "."
```

- It finds the UI app, its framework, dev command and URL, and - when a compose service builds that app - the Docker rebuild commands and the URL the container is served on. It saves all of it to `design-ref/.parity-project.json`.
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

- It prints `login needed` or `open`. If `login needed`, run `progress.mjs wait 3 --note "log in once"` and return STATUS `needs-user`: "The page needs a login. A browser window will open - log in there, then close it." Options: `Open the login window` / `Stop`.
- When resumed with "open", run:

```
node "<ROOT>/scripts/capture.mjs" --data "<DATA>" --mode login --target "<preview_url>"
```

  It saves the session (never the password) in the plugin data folder; every later capture on that site uses it.

## 6. Libraries, dev server, leftovers

- **Missing libraries:** if the artifact uses a library the project lacks (same icon set, same animation library), the right fix is to install that same library rather than hand-recreating its output. Never install without the user's yes:
  1. Run `progress.mjs wait 3 --note "install <library>?"`.
  2. Return STATUS `needs-user`. The QUESTION names the library and why it is needed. Options: `Install it` / `Don't install`.
  3. When resumed with the answer, run `progress.mjs start 3` and continue.
- **Dev server:** start the detected dev command in the background from the app folder, or reuse it if it is already running. Check that `preview_url` loads.
- **Leftovers:** if an earlier run of this screen created a separate component that this run replaces (for example a folder built before enhance mode existed), list those paths in NOTES as `leftovers`. Do not delete them here; stage 9 asks.

## On success

1. Run `progress.mjs done 3 --note "<framework>, <styling> · <mode>: <target file or new location>"`.
2. Add these to NOTES: `mode`, `app_dir`, `stack`, `dev_command`, `preview_url`, `target_files` (enhance) or `target` (new), `docker` (service and served URL, or none), `login` (yes/no), `libraries`, `leftovers`.
