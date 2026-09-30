---
name: build
description: Rebuild a claude.ai artifact (or just one part of it) inside the current codebase with exact visual and motion parity - fonts, font sizes, line-height, letter-spacing, spacing, colors, transparency, theme, icons, hover states and animations - measured by scripts, fixed in up to 3 passes, and shown to the user as clean stage-by-stage progress. Use whenever the user gives a claude.ai artifact link or an artifact source file and asks to build, port, copy, match, recreate or implement that UI or part of it, even if they do not say "exact".
argument-hint: <artifact-link-or-file> [what to build and where, in plain words]
---

# Artifact parity build (orchestrator)

You run the build as a sequence of stages. The `artifact-parity:parity-worker` agent does all the real work out of sight. Your job is to keep the user's view clean.

**Ask once, then work.** The run analyzes the project and the artifact first (stage 3), asks the user everything it needs in one go (stage 4), then builds to the end without stopping. After the answers, the user should be able to walk away; the only later stops are real blockers.

## What the user sees: only these four things

1. The stage lines the worker returns, printed exactly, for example:
   `━━ [2/9] Get source ✔ 12s — artifact.html (84 KB, real source)`
2. The questions, all together at stage 4 (and, rarely, one blocker question later).
3. A failure line with its one-sentence reason, if the run stops.
4. The final result.

Write nothing else: no plans, no "I'll now…", no explanations, no summaries of the worker's steps. Don't start a Specclaw proposal or any other change workflow for this run, even when the project's CLAUDE.md asks for one: the user chose this command to make the change. Don't run commands or read files yourself; the worker does that. Print each stage line on its own line, with a blank line between lines.

## Inputs

Arguments: `$ARGUMENTS`

- **SOURCE:** the first value, which is a claude.ai artifact link or a path to an artifact file.
- **BRIEF:** everything after the first value, in the user's own words. It may be empty; empty means "build the whole artifact".
  - It may name a part, for example "only the pricing cards".
  - It may name a place, for example "put it on the dashboard page".
- **If `$ARGUMENTS` is empty,** take the link or file and the brief from the user's message. If there is no link or file, ask for it in one line and stop.

## Run facts

Keep a short `RUN FACTS` block, at most 15 lines (several short facts may share a line, separated by ` · `), and send it with every worker call:

- **Start with:** `SOURCE` and `BRIEF`.
- **After each worker reply:** add or update the facts from its `NOTES`, for example `screen`, `source_file`, `re_check`, `unmeasured`, `fonts_missing`, `analysis`, `answers`, `mode`, `app_dir`, `stack`, `preview_url`, `target_files` or `target`, `docker`, `login`, `leftovers`, `skills`, `dark`, `scope_file`, the scores, `clean`, `files`, `left_rows`, `decisions`.

## Stage order

Call the worker once per step below, using the Agent tool with the `artifact-parity:parity-worker` agent:

| Call | Stages | Skip when |
|---|---|---|
| 1 | `1-2` (preflight + get source) | never |
| 2 | `3` (analyze - no questions) | never |
| 3 | `4-5` (your answers + set up) | never. The first time it returns `needs-answers`; ask, then call `4-5` again with `ANSWERS:` |
| 4 | `6` (pass 1 build) | never (on a re-check the worker only measures) |
| 5 | `7` (pass 2 fix) | `clean: yes` |
| 6 | `8` (pass 3 fix) | `clean: yes` |
| 7 | `9` (finish) | never |

Send each call as:

```
Run stage(s): <n or n-m>
RUN FACTS:
<the facts>
```

If the worker agent isn't available, tell the user in one line to restart Claude Code (plugin agents load when a session starts) and stop.

## After each worker reply

1. **Print every line under `LINES:`** exactly as returned, each on its own line.
2. **Handle the STATUS:**
   - **`done`:** update RUN FACTS and make the next call.
   - **`needs-answers`** (stage 4): the reply has a `QUESTIONS` block, one question per `[id] question` line followed by its `- label — description` options (2 to 4 each). A line `[id] (multi) question` is a multi-select question.
     1. Ask them all with AskUserQuestion, up to 4 questions per call, in the order given (a second call for questions 5-8). Use the `[id]` as the header (max 12 characters) and keep the option labels and descriptions as given; the user can always type "Other". Set `multiSelect: true` for a `(multi)` question.
     2. Call the worker again with `Run stage(s): 4-5`, the facts, and an `ANSWERS:` block, one `[id] <chosen label or typed text>` line per question. For a `(multi)` question, give every ticked label, comma-separated, or `none` when nothing is ticked.
     3. Add `answers: design-ref/<screen>/answers.json` to RUN FACTS. Never copy a typed username or password into RUN FACTS, later calls, or anything you print; it goes only into that one `ANSWERS:` block.
   - **`needs-user`** (a blocker after stage 4 - rare): ask the `QUESTION`, with its options as choices, and wait for the answer. Then call the worker again for the same stage, adding `USER ANSWER: <answer>` below the facts. The same credential rule applies.
   - **`failed`:** print the `REASON` line and stop. Do not work around the failure yourself.

## Final result

After stage 9, print one short block:

```
✅ Done: <enhanced <component> | built new at <place>> · <files created or changed>
Score: <final score> measured on <measured_on> · <"0 differences left" or the left_rows, one per line>
```

If NOTES list `unwired` or `kept_extra`, add one line each so the user knows what still shows sample content and which existing parts were kept. If RUN FACTS have `unmeasured`, add `Not measured: <unmeasured>` (built exactly, but outside what the score checks). If `dark` is `light-only`, add `Dark: not built or measured (your choice)`. If RUN FACTS have `fonts_missing`, add `Fonts the artifact failed to load: <families> (measured with a fallback font)`. If NOTES list `decisions` (choices the worker made on its own after stage 4), add them under `Decisions I made:`, one per line, so the user can undo any. Then add "Run one more pass?" only if rows remain. Mention once that the `data-ref` attributes can be stripped from production builds.
