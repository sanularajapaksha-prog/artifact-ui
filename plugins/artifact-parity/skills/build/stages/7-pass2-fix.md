# Stage 7 - Pass 2: fix from the report

Run `progress.mjs start 7`.

1. **Read only `design-ref/<screen>/report.md`.** Do not re-read the whole artifact.
2. **Fix rows in the order the report lists them:** missing, fonts, theme and tokens, typography, box, layout, states, motion. Layout rows often disappear once the font and typography rows are fixed, so do not chase layout rows before those are clean.
3. **Change only what a row names.** Re-open the artifact source only for the specific element a row points to.
4. **Measure.** Make sure the preview URL loads, then run capture in `build` mode, and run compare with `--scope "design-ref/<screen>/scope.json" --pass 2`.
5. **Report.** Run `progress.mjs done 7 --score "<score>" --note "<N> rows left"`.
   - If compare reports CLEAN, also run `progress.mjs skip 8 --note "clean after pass 2"` and return both lines.
   - Add these to NOTES: `score_pass_2`, `clean`, and `files`.
