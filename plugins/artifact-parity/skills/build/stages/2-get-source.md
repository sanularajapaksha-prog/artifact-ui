# Stage 2 - Get the real source

Run `progress.mjs start 2`.

**Pick the folder.** Use the screen name from the facts. If there is none, derive a kebab-case name:

- from the part named in the BRIEF, for example `pricing-cards`
- otherwise from the artifact's title or main heading

Create `design-ref/<screen>/`.

**Re-check:** if `design-ref/<screen>/` already holds a saved `artifact.*` from an earlier run and the SOURCE is the same link or file, this is a re-check:

1. Reuse the saved source.
2. Add `re_check: yes` to NOTES.
3. Skip straight to "Verify it is real source" below.

**Get the source, by input type:**

- **Local file path:** copy it to `design-ref/<screen>/artifact.<ext>`, keeping its extension.
- **`https://claude.ai/code/artifact/...` or any other claude.ai artifact link that is not `/public/`:**
  1. Fetch it with WebFetch. Claude Code reads these links through the user's claude.ai login; curl only gets an empty app shell.
  2. Claude Code also saves the page's full source to a local file. Take that file path from the tool result, open the file, and copy it to `design-ref/<screen>/artifact.html`. If the result does not name a saved file, do not guess a path; use the fetch script below instead.
  3. Ignore the summary text completely.
- **`https://claude.ai/public/artifacts/...`, or when the step above gave no saved source file:**

```
node "<ROOT>/scripts/fetch-public.mjs" --data "<DATA>" --url "<SOURCE>" --out "design-ref/<screen>"
```

**Verify it is real source:**

```
node "<ROOT>/scripts/check-source.mjs" --file "design-ref/<screen>/artifact.<ext>"
```

**If nothing could be fetched or the check fails:**

1. Run `progress.mjs fail 2 --note "no real source from the link"`.
2. Return STATUS `failed`, with REASON: "I couldn't get the artifact's source from that link. In claude.ai, open the artifact and use Download, then run the command again with the file path instead of the link."
3. Build nothing.

**On success:**

1. Run `progress.mjs set --screen "<screen>"`.
2. Run `progress.mjs done 2 --note "<file name> (<size>, real source)"`.
3. Add these to NOTES: `screen`, `source_file`, and `re_check` (yes or no).
