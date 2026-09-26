# Stage 5 - Capture the reference (scripts only)

Run `progress.mjs start 5`, then:

```
node "<ROOT>/scripts/capture.mjs" --data "<DATA>" --mode ref --target "<source_file>" --out "design-ref/<screen>"
```

This writes two files:

- `ref.json` holds every measured value. Never open it.
- `ref-map.md` is the build checklist. It lists the sections, plus the `r-###` id, tag and text of each element.

**Choose the part to build.**

- **BRIEF names a part** (for example "only the pricing cards"): match it to the sections in `ref-map.md`, then write `design-ref/<screen>/scope.json`:

```
{ "brief": "<the user's words>", "sections": ["<section id>", "..."] }
```

- **BRIEF names no part:** write the same file with `"sections": "all"`.
- **The match is unclear**, because the words fit several sections or none:
  1. Run `progress.mjs wait 5 --note "which part?"`.
  2. Return STATUS `needs-user`. The QUESTION lists the candidate sections by name as options, at most 4 of them.
  3. When resumed with the answer, run `progress.mjs start 5` and write the scope.

**On success:**

1. Run `progress.mjs done 5 --note "your part \"<part>\" = <n> elements"`. If the whole artifact is in scope, use `<n> elements, <m> screen sizes` as the note instead.
2. Add these to NOTES: `scope_file`, `in_scope_elements`.
