# Stage 7 - Pass 2: fix from the report

Run `progress.mjs start 7`.

1. **Read only `design-ref/<screen>/report.md`.** Do not re-read the whole artifact.
2. **Fix rows in the order the report lists them:** missing, fonts, theme and tokens, typography, box, layout, states, motion. Layout rows often disappear once the font and typography rows are fixed, so do not chase layout rows before those are clean.
   - **Motion rows:** use the motion skill from the facts, if stage 5 installed or chose one (read its `SKILL.md`). If the user skipped that part at stage 4, fix the motion rows without a skill - don't ask again. The artifact's exact values always win over a skill's advice.
   - **`state not reached` rows** are not design misses: the artifact's rule is in your CSS, but the measured page isn't in the state that turns it on (for example a halo that shows only while a job is running). Don't edit code for them and never force the class on permanently. Instead, find a page or click that reaches the state (a record whose data is in that state, a toggle, a route) and, if you find one, set it as `preview_url` or `build_clicks` and measure again. Otherwise leave them for stage 9, which follows the user's stage 4 answer for them.
3. **Change only what a row names.** Re-open the artifact source only for the specific element a row points to.
   - Edit only the files you built or enhanced in stage 6 (`files` in the facts).
   - In `enhance` mode the stage 6 "Keep" rules still hold: never remove state, handlers, data or a feature to make a row pass. If a row can only pass that way, leave it and note why.
4. **Measure.** Make sure `preview_url` loads, then run capture in `build` mode (with one `--click` per `build_clicks` entry), and run compare with `--scope "design-ref/<screen>/scope.json" --pass 2` (plus `--live-data` in `enhance` mode). If you changed code, run the app's typecheck again first.
5. **Report.** Run `progress.mjs done 7 --from-report "design-ref/<screen>" [--note "<short reason>"]`. The score and row count come from compare's `result.json`; `--note` may only add a short reason (no counts, no percentages, no "clean"). Never report your own count of rows.
   - If compare reports CLEAN, also run `progress.mjs skip 8 --note "clean after pass 2"` and return both lines.
   - Add these to NOTES: `score_pass_2`, `clean`, and `files`.
