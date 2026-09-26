# Stage 8 - Pass 3: fix what remains, with visual check

Run `progress.mjs start 8`.

1. **Repeat the Stage 7 steps and rules,** using `--pass 3` (plus `--live-data` in `enhance` mode).
2. **Use the crops.** For rows that still fail, compare also writes side-by-side crops (reference, build, diff) into `design-ref/<screen>/crops/`.
3. **View at most 5 crops,** and only for rows the numbers alone do not explain, such as canvas, images or subtle rendering differences.
4. **Report.** Run `progress.mjs done 8 --score "<score>" --note "<N> rows left"`.
5. **NOTES:** add `score_pass_3`, `files`, and `left_rows`: at most 5 lines, each with the element, expected value, actual value and likely cause.
