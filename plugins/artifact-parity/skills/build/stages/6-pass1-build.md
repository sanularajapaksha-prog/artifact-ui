# Stage 6 - Pass 1: build

Run `progress.mjs start 6`.

**Re-check:** if the facts say `re_check: yes` and the in-scope `data-ref` attributes already exist **inside the chosen place** (`target_files` in `enhance` mode, `target` in `new` mode), skip steps 1-8 and go straight to step 9 (measure). `data-ref` attributes that live elsewhere (for example in `leftovers` from an earlier run) don't count: build normally.

**Where to build:** only at the place the user chose in stage 4 (`answers.json`, applied in stage 5) - `target_files` in `enhance` mode, `target` in `new` mode. Never somewhere else, and never in a second copy.

**No questions here.** Decide, and record each non-obvious choice in NOTES `decisions`. For example: the target files already carry `data-ref` attributes from an earlier run that clash with this artifact's ids - rename the old ones to `data-ref-old` and note it; a design element that could map to two existing elements - pick the one in the same layout position and note it.

**Frontend only:** every file you create or change is inside `app_dir`. Fonts, global CSS, routes and libraries go in the app's own files. If the design needs data the frontend doesn't have (a new API field or endpoint), don't touch the backend: render the artifact's content for it and add `needs backend: <what>` to `unwired`.

1. **Read the plan inputs.** Read the artifact source once, fully. Then read `design-ref/<screen>/scope.json` and the in-scope part of `ref-map.md`. Build only the in-scope sections. In `enhance` mode, also read every file in `target_files` fully before changing anything.
2. **Read the chosen skills.** Read the `SKILL.md` of each skill listed in the facts. Apply each one only to its own part. The artifact's values and these rules always win over a skill's advice.
3. **Set up global prerequisites first.** These cascade into everything:
   - fonts: the same families, weights and loading source as the artifact
   - theme variables and `@keyframes`
   - any base styles the artifact relies on

   If the project's global CSS (reset, base line-height, box-sizing, body font) differs from the artifact's, correct it at the component root. Do not edit global styles for the whole app.
4. **`enhance` mode - change the existing component, keep what it does:**
   - **Keep:** state, hooks, data fetching, props and their types, event handlers, routing, permissions, i18n keys, `data-testid` and accessibility attributes. Do not rename exports or move files.
   - **Change:** markup structure where the artifact's layout depends on it, class names, inline styles and tokens, icons, motion - to the artifact's exact values.
   - **Match elements by role:** an existing element that plays the same role as an artifact element (same label, same purpose, same place in the layout) takes that artifact element's classes, styles and `data-ref`.
   - **Artifact parts the component lacks:** add them inside the component. Wire them to existing data or handlers when an obvious one exists; otherwise render the artifact's content and list them in NOTES as `unwired`.
   - **Existing parts the artifact lacks:** keep them working and style them with the artifact's tokens; list them in NOTES as `kept_extra`. Never delete a feature to match the design.
   - **Lists from real data:** tag the first rendered items with the artifact's item ids by index (for example `data-ref={refIds[i]}` where `refIds` are the artifact items' ids in order); items past the artifact's count get no `data-ref`.
5. **`new` mode - build it at the chosen place:** create the component at `target`, following the project's file and naming conventions, and mount it there (page, route or parent component).
6. **Build section by section, in `ref-map.md` order.** Run `progress.mjs sub 6 --note "section <i>/<total> <section name>"` as each section begins. For each element:
   - keep the same structure wherever layout depends on it (wrappers that carry flex, grid, gap or padding stay)
   - use the artifact's exact classes and styles
   - add its `data-ref`
7. **Port motion and states.**
   - If stage 5 installed or chose a skill for the motion part, read its `SKILL.md` now and follow it for how motion is written in this project; the artifact's values still win.
   - Copy `@keyframes` verbatim. For JS-driven motion, use the same library and the same values: duration, delay, easing or spring settings, stagger, and trigger (load, hover, scroll, in-view).
   - **Pseudo-element motion** (`::before`/`::after` rings, halos, shimmers, moving highlights): copy the pseudo rule and its `@keyframes` exactly, including `content`, `inset`, `border`, `opacity`, `transform` and the class that switches it on for a state. In a Tailwind or CSS-in-JS project, put it in the app's own stylesheet (or the component's CSS module) scoped under the component's root class; don't approximate it with a different element or library. Keep the artifact's `prefers-reduced-motion` fallback too.
   - Port hover, focus, active, disabled, selected and open/closed styles.
8. **Check nothing broke.** If the app has a `typecheck`, `lint` or `tsc` script, run it for the app. Fix errors in files you changed; never silence them.
9. **Measure.**
   - Make sure `preview_url` loads. Start the dev server in the background if it is not running.
   - Run `progress.mjs sub 6 --note "measuring"`, then (add `--live-data` in `enhance` mode, where the page shows real data instead of the artifact's sample text):

```
node "<ROOT>/scripts/capture.mjs" --data "<DATA>" --mode build --target "<preview_url>" --out "design-ref/<screen>" [--click "<each build_click>" ...]
node "<ROOT>/scripts/compare.mjs" --dir "design-ref/<screen>" --scope "design-ref/<screen>/scope.json" --pass 1 [--live-data]
```

10. **Report.** Run `progress.mjs done 6 --from-report "design-ref/<screen>" [--note "<short reason>"]`. The score and row count come from compare's `result.json`; `--note` may only add a short reason (no counts, no percentages, no "clean"). Never report your own count of rows.
    - If compare reports CLEAN, also run `progress.mjs skip 7 --note "clean after pass 1"` and `progress.mjs skip 8 --note "clean after pass 1"`. Return all three lines.
    - Add these to NOTES: `score_pass_1`, `clean` (yes/no), `files` (created or changed), `decisions`, and in `enhance` mode `unwired` and `kept_extra` (or "none").
