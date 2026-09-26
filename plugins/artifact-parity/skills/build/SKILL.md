---
name: build
description: Rebuild a claude.ai artifact (or just one part of it) inside the current codebase with exact visual and motion parity - fonts, font sizes, line-height, letter-spacing, spacing, colors, transparency, theme, icons, hover states and animations - measured by scripts, fixed in up to 3 passes, and shown to the user as clean stage-by-stage progress. Use whenever the user gives a claude.ai artifact link or an artifact source file and asks to build, port, copy, match, recreate or implement that UI or part of it, even if they do not say "exact".
argument-hint: <artifact-link-or-file> [what to build and where, in plain words]
---

# Artifact parity build (orchestrator)

You run the build as a sequence of stages. The `artifact-parity:parity-worker` agent does all the real work out of sight. Your job is to keep the user's view clean.

## What the user sees: only these four things

1. The stage lines the worker returns, printed exactly, for example:
   `━━ [2/9] Get source ✔ 12s — artifact.html (84 KB, real source)`
2. Questions that need the user's answer.
3. A failure line with its one-sentence reason, if the run stops.
4. The final result.

Write nothing else: no plans, no "I'll now…", no explanations, no summaries of the worker's steps. Don't run commands or read files yourself; the worker does that. Print each stage line on its own line, with a blank line between lines.

## Inputs

Arguments: `$ARGUMENTS`

- **SOURCE:** the first value, which is a claude.ai artifact link or a path to an artifact file.
- **BRIEF:** everything after the first value, in the user's own words. It may be empty; empty means "build the whole artifact".
  - It may name a part, for example "only the pricing cards".
  - It may name a place, for example "put it on the dashboard page".
- **If `$ARGUMENTS` is empty,** take the link or file and the brief from the user's message. If there is no link or file, ask for it in one line and stop.

## Run facts

Keep a short `RUN FACTS` block, at most 15 lines, and send it with every worker call:

- **Start with:** `SOURCE` and `BRIEF`.
- **After each worker reply:** add or update the facts from its `NOTES`, for example `screen`, `source_file`, `re_check`, `stack`, `preview_url`, `target`, `skills`, `scope_file`, the scores, `clean`, `files`, `left_rows`.

## Stage order

Call the worker once per step below, using the Agent tool with the `artifact-parity:parity-worker` agent:

| Call | Stages | Skip when |
|---|---|---|
| 1 | `1-2` (preflight + get source) | never |
| 2 | `3` (understand project) | never |
| 3 | `4` (pick skills) | never |
| 4 | `5` (capture reference) | never |
| 5 | `6` (pass 1 build) | never (on a re-check the worker only measures) |
| 6 | `7` (pass 2 fix) | `clean: yes` |
| 7 | `8` (pass 3 fix) | `clean: yes` |
| 8 | `9` (finish) | never |

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
   - **`needs-user`:** ask the `QUESTION`, with its options as choices, and wait for the answer. Then call the worker again for the same stage, adding `USER ANSWER: <answer>` below the facts.
   - **`failed`:** print the `REASON` line and stop. Do not work around the failure yourself.

## Final result

After stage 9, print one short block:

```
✅ Done: <component / files created or changed>
Score: <final score> · <"0 differences left" or the left_rows, one per line>
```

Then add "Run one more pass?" only if rows remain. Mention once that the `data-ref` attributes can be stripped from production builds.
