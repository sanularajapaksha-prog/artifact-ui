# Stage 9 - Finish

Run `progress.mjs start 9`.

1. **Place the UI.** If the BRIEF named a target page or location that differs from the preview route, place the finished component there.
2. **Remove the temporary preview route,** unless the user asked for a page.
3. **Keep the `data-ref` attributes.** They are harmless and let future runs re-check the screen.
4. **Report.** Run `progress.mjs done 9 --score "<final score>"`. The script adds the total time.
5. **NOTES:** add `files` (every file created or changed), `final_score`, and `left_rows` (copied from the last pass, or "none").
