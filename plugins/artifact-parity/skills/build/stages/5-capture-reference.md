# Stage 5 - Capture the reference (scripts only)

Run `progress.mjs start 5`, then:

```
node "<ROOT>/scripts/capture.mjs" --data "<DATA>" --mode ref --target "<source_file>" --out "design-ref/<screen>"
```

This writes two files:

- `ref.json` holds every measured value. Never open it.
- `ref-map.md` is the build checklist. It lists the state it was captured in, the **State controls** (buttons, tabs and toggles that change what is shown), the sections, plus the `r-###` id, tag and text of each element.

**Get the right state.** An artifact often shows some parts only after a click: a mode (Edit / Preview / Timeline), a tab, an open panel. The first capture is the load state.

- If the part the BRIEF names is not in `ref-map.md`, or the BRIEF names a mode or tab ("timeline tab", "preview mode", "settings panel"), look at **State controls** for the control that shows it and capture again with it:

```
node "<ROOT>/scripts/capture.mjs" --data "<DATA>" --mode ref --target "<source_file>" --out "design-ref/<screen>" --click "<control text>" [--click "<next>" ...]
```

- Use the control's exact text (or its `#id`). Several clicks run in order.
- If it's unclear which control shows the part, run `progress.mjs wait 5 --note "which state?"` and return STATUS `needs-user` listing up to 4 controls as options.
- A part that exists in several states: capture the state the BRIEF names, else the load state.

**Choose the part to build.**

- **BRIEF names a part** (for example "only the pricing cards"): match it to `ref-map.md`, then write `design-ref/<screen>/scope.json`.
  - If the part is a whole section, use `"sections"`.
  - If it is **smaller than its section** (a rail, a card group, a toolbar inside a bigger section), use `"elements"` with the part's subtree range. Take it from the **Parts** list in `ref-map.md` (`[r-023..r-055 · 33]`), or from the `[first..last · count]` shown on the element's own line. Pick the **smallest** named part that holds everything the BRIEF names - not its wrapper: a wrapper such as a full-width strip or panel is sized by the page, so its width would be counted as the part's. Compare then checks only that part and measures x/y from its first element. **Never scope a whole section to cover a small part**: everything else in the section would be counted, and the score could never reach 100%.

```
{ "brief": "<the user's words>", "sections": ["<section id>"], "elements": ["r-022..r-055"], "clicks": ["<ref clicks, if any>"] }
```

  - Allowed keys: `brief`, `sections`, `elements`, `clicks`, `build_clicks`, `note`. Compare stops on any other key.

- **BRIEF names no part:** write the same file with `"sections": "all"`.
- **The match is unclear**, because the words fit several sections or none:
  1. Run `progress.mjs wait 5 --note "which part?"`.
  2. Return STATUS `needs-user`. The QUESTION lists the candidate sections by name as options, at most 4 of them.
  3. When resumed with the answer, run `progress.mjs start 5` and write the scope.

**Build clicks.** The built page has to be measured in the same state. Add `"build_clicks"` to `scope.json`: the clicks that bring the built page into that state (`new` mode: usually the same texts as `clicks`; `enhance` mode: the real app's own control - its text or selector - or `[]` if `preview_url` already opens in that state). Every later `capture.mjs --mode build` passes one `--click` per entry, in order.

**On success:**

1. Run `progress.mjs done 5 --note "your part \"<part>\" = <n> elements"` (add ` · after <clicks>` when a state was clicked). If the whole artifact is in scope, use `<n> elements, <m> screen sizes` as the note instead.
2. Add these to NOTES: `scope_file`, `in_scope_elements`, `clicks`, `build_clicks`.
