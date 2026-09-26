# Stage 7 - Pass 2: fix from the report

Run `progress.mjs start 7`.

1. **Read only `design-ref/<screen>/report.md`.** Do not re-read the whole artifact.
2. **Fix rows in the order the report lists them:** missing, fonts, theme and tokens, typography, box, layout, states, motion. Layout rows often disappear once the font and typography rows are fixed, so do not chase layout rows before those are clean.
   - **Motion rows and no motion skill:** if `report.md` has `motion` rows (or `::before`/`::after` rows on animated elements), and the facts list no skill for the motion part and the user didn't skip it, get one first, exactly as stage 4 does: run `progress.mjs wait 7 --note "missing skill: motion"` and return STATUS `needs-user` with scout's missing-skill message for that part and the options `Find and install one` / `Installed - rescan` / `Skip these parts`; then follow stage 4's "find" / pick / install steps (scout Step 5b), with `progress.mjs start 7` when resumed. Read the chosen skill's `SKILL.md` and use it for the motion rows. The artifact's exact values still win over the skill's advice.
3. **Change only what a row names.** Re-open the artifact source only for the specific element a row points to.
   - Edit only the files you built or enhanced in stage 6 (`files` in the facts).
   - In `enhance` mode the stage 6 "Keep" rules still hold: never remove state, handlers, data or a feature to make a row pass. If a row can only pass that way, leave it and note why.
4. **Measure.** Make sure `preview_url` loads, then run capture in `build` mode (with one `--click` per `build_clicks` entry), and run compare with `--scope "design-ref/<screen>/scope.json" --pass 2` (plus `--live-data` in `enhance` mode). If you changed code, run the app's typecheck again first.
5. **Report.** Run `progress.mjs done 7 --score "<score>" --note "<N> rows left"`.
   - If compare reports CLEAN, also run `progress.mjs skip 8 --note "clean after pass 2"` and return both lines.
   - Add these to NOTES: `score_pass_2`, `clean`, and `files`.
