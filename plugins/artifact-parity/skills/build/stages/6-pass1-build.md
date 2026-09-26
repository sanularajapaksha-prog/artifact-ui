# Stage 6 - Pass 1: build

Run `progress.mjs start 6`.

**Re-check:** if the facts say `re_check: yes` and the in-scope elements already carry `data-ref` attributes, skip steps 1-6 and go straight to step 7 (measure).

1. **Read the plan inputs.** Read the artifact source once, fully. Then read `design-ref/<screen>/scope.json` and the in-scope part of `ref-map.md`. Build only the in-scope sections.
2. **Read the chosen skills.** Read the `SKILL.md` of each skill listed in the facts. Apply each one only to its own part. The artifact's values and these rules always win over a skill's advice.
3. **Set up global prerequisites first.** These cascade into everything:
   - fonts: the same families, weights and loading source as the artifact
   - theme variables and `@keyframes`
   - any base styles the artifact relies on

   If the project's global CSS (reset, base line-height, box-sizing, body font) differs from the artifact's, correct it at the component root. Do not edit global styles for the whole app.
4. **Build section by section, in `ref-map.md` order.** Run `progress.mjs sub 6 --note "section <i>/<total> <section name>"` as each section begins. For each element:
   - keep the same structure wherever layout depends on it (wrappers that carry flex, grid, gap or padding stay)
   - use the artifact's exact classes and styles
   - add its `data-ref`
5. **Port motion.**
   - Copy `@keyframes` verbatim.
   - For JS-driven motion, use the same library and the same values: duration, delay, easing or spring settings, stagger, and trigger (load, hover, scroll, in-view).
6. **Port states:** hover, focus, active, disabled, selected and open/closed styles.
7. **Measure.**
   - Make sure the preview URL loads. Start the dev server in the background if it is not running.
   - Run `progress.mjs sub 6 --note "measuring"`, then:

```
node "<ROOT>/scripts/capture.mjs" --data "<DATA>" --mode build --target "<preview_url>" --out "design-ref/<screen>"
node "<ROOT>/scripts/compare.mjs" --dir "design-ref/<screen>" --scope "design-ref/<screen>/scope.json" --pass 1
```

8. **Report.** Run `progress.mjs done 6 --score "<score compare printed>" --note "<N> rows to fix"`.
   - If compare reports CLEAN, also run `progress.mjs skip 7 --note "clean after pass 1"` and `progress.mjs skip 8 --note "clean after pass 1"`. Return all three lines.
   - Add these to NOTES: `score_pass_1`, `clean` (yes/no), and `files` (created or changed).
