---
name: scout
description: Pick which installed skills to use for a task, then use them. Use at the start of any multi-step task (building or porting UI, artifact builds, new features, refactors, migrations, tests, documents, deployments) and whenever the artifact-parity build or design skill starts. It uses installed skills first. When a part of the task has no matching skill, it tells the user exactly what skill is needed and offers to find one on skills.sh and install the one the user picks.
argument-hint: [task description]
---

# Scout: use the right installed skills

Before real work starts, make sure:

- every part of the task that has a relevant installed skill actually uses it, and
- the user knows which parts have no skill.

Use installed skills first. Search online (Step 5b) only when the user chooses "find", and install only the exact skill the user picks. Never install anything on your own initiative.

Skip scouting for small tasks, such as a single quick edit, a question, or a one-file fix. Just do those.

## Step 1 - Split the task into parts

- **Task:** `$ARGUMENTS`
  - If this is empty, use the user's current request.
  - If another skill called you with a list of parts, use that list.
- **Limit:** list at most 5 parts (for an artifact design, the design parts from `bundle.json` come on top of these).
- **What a part is:** one area of expertise the task needs. Name it with its technology and version when known, for example:
  - `ui-framework: Next.js 15 app router`
  - `styling: Tailwind v4`
  - `animation: GSAP ScrollTrigger`
  - `testing: Playwright`
- **Where to find the technologies:** the request, `package.json`, and, for artifact builds, the artifact's imports.
- **Don't invent parts** the task doesn't need.

## Step 2 - Check remembered choices

Read `${CLAUDE_PLUGIN_DATA}/skill-choices.json` if it exists (ignore a UTF-8 byte order mark at its start). It maps part labels to a skill name or to `"skip"`.

- **On your own** (`/artifact-parity:scout`, or a task that is not an artifact-parity build or design): a remembered skill that is still installed is used without asking, and a remembered `"skip"` means don't ask about that part again. Both are listed in the Step 7 report.
- **When the artifact-parity build or design skill called you:** a remembered skill is only the *recommended* choice for its part. It is never used until the caller's question round confirms it (Step 4b).
- **Keys starting with `design/`** belong to design runs: a build ignores them. A design run reads `design/<label>` first, and never applies a build's `"skip"` to a design part (that part is offered again).
- **"You used it before":** a skill counts as used before when its name appears as a value anywhere in the file, whatever the label.

## Step 3 - List installed skills

Combine two sources:

1. The skills already in your available-skills list (names and descriptions).
2. The skill folders on disk: user, project, legacy commands, and installed plugins.

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/list-skills.mjs" --project "."
```

Run the script once per task, not once per part. If the script is missing or fails, use source 1 only.

## Step 4 - Match each part

- **Pick the skill that clearly covers the part.** Its description must cover that part's technology or job.
- **Prefer the most specific skill.** A GSAP skill beats a general frontend skill.
- **No clear match means missing.** Don't stretch a loosely related skill to cover a part.
- **Artifact builds:** when the artifact-parity build skill called you, never select design-taste skills. These are skills that choose palettes, fonts or layouts, or push a "distinctive" look. They conflict with exact copying. Only implementation skills qualify: framework, styling system, animation library, icons, testing. Every skill in `${CLAUDE_PLUGIN_ROOT}/bundle.json` is a design skill, so none of them is a build candidate.
- **Artifact designs:** when the artifact-parity design skill called you, design-taste skills are wanted. Use the design parts in `${CLAUDE_PLUGIN_ROOT}/bundle.json` `parts` (`direction`, `motion`, `critique`, plus `redesign` when an existing part is redesigned) alongside the implementation parts the requirement needs (for example `animation: GSAP ScrollTrigger`). For a design part, the first skill listed for it in `parts` that `skills-offer.mjs --check` reports as `installed` is the bundle's pick; a same-name skill from another author (`other-source` or `kept`) is the user's own skill, not ours. When advice conflicts, the order is: the user, then the project's own tokens and fonts (when designing for an existing project), then the taste skill.

## Step 4b - Conflicts and confirmation (build and design calls only)

Skip this step when you run on your own. When the build or design skill called you, return, for each part, what its question round needs. **Don't ask anything yourself; the caller asks.**

1. **Candidates** for a part: the installed skills that clearly cover it (Step 4), at most 3.
2. **A conflict** is a part with more than one candidate where the user has a real choice: our bundle skill against one the user installed or used before (design), or two of the user's own skills (build).
3. **Order each part's candidates best first:**
   - The part has a bundle skill (design runs only): the bundle's pick first, marked recommended; then the rest by skills.sh installs, highest first; unknown installs last.
   - No bundle skill: the skill used before first, marked recommended; otherwise the highest installs first.
4. **Install counts** for every candidate you return, in one call (it asks skills.sh; about a second per skill, cached for 7 days):

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/skills-offer.mjs" --installs <skill names, comma-separated> --data "${CLAUDE_PLUGIN_DATA}"
```

   Each name gets `{ source, installs }`; `installs: null` means unknown (a plugin's skill, a hand-written one, or no network).
5. **Return** per part: `part`, the ordered `candidates` (each `skill`, `path`, `source`, `installs`, `used_before`, `bundle`), and whether it is a conflict. The caller turns this into one confirmation question for the run plus at most 2 conflict questions.

## Step 5 - Ask once about missing parts

If any part has no match and no remembered choice, stop. Send the user one message that covers every missing part, in this format:

```
No installed skill covers these parts of the task:

1. <part label>
   Needed: <what the skill must cover, concretely: library and version, and the specific APIs or patterns this task uses>
   Search words: <3-5 keywords>

Reply "find" and I'll search skills.sh and show you the best matches to pick from,
"done" if you installed one yourself, or "skip" to continue without it.
```

Then wait for the reply:

- **"find"** (for all parts, or for the ones named): go to Step 5b.
- **"done":** run Step 3 again, then Step 4 again.
- **"skip"** (for all parts, or for the ones named): continue without a skill for those parts, and save `"skip"` for them.

## Step 5b - Find and install (only after the user chose "find")

1. **Search** once per missing part, with that part's search words. Run it through Bash, with telemetry off (the search still reaches skills.sh):

```
DISABLE_TELEMETRY=1 npx -y skills@1.7.0 find <search words>
```

   - **Search words:** 2 words work best: a library plus a feature (`gsap scrolltrigger`, `framer motion`, `tailwind v4`), or an area plus a noun (`loading animation`, `design tokens`). Never paste the user's own sentence, project name or file paths: the words are sent to skills.sh. Avoid single generic words (`motion`, `icons`, `parallax`, `lenis`), which match unrelated skills.
   - **Reading the output:** each result is a line `owner/repo@skill <N> installs` (or `1 install`, or no count at all), followed by a line starting `└ https://skills.sh/`. Count results by those link lines, not by the word "installs". Ignore colour codes.
   - **Results are sorted by installs, not by relevance,** so the first line is often an unrelated popular skill. Judge every line by its name.
   - `No skills found` can also mean the search failed (offline, blocked, rate-limited). Retry once with the 2 most specific words, then with 1. If it still finds nothing, tell the user "the search found nothing (or could not reach skills.sh)", not "no skill exists".
2. **Pick at most 3 candidates per part.** A candidate must clearly cover the part's technology and version (a Tailwind v4 part needs a v4 skill, not a v3 or Expo one). Prefer 1K+ installs and well-known sources: the library's own organisation (for example greensock for GSAP) or the original repository rather than a copy. In design runs a skill under 1K installs is fine when it comes from the library's own organisation. For artifact builds, the Step 4 rule applies: no design-taste skills.
3. **Ask the user to pick.** One question per part. Each option is `owner/repo@skill · <installs> installs`, with the source repository and the skills.sh link (which shows its security checks) as its description, plus a last option `Skip this part`. If no candidate qualifies, say so in one line and skip the part without asking.
4. **Install only the picked skill.** Split the id `owner/repo@skill` at the last `@`, keep the source first, and quote both parts (some skill names contain spaces or colons). `git` must work (`git --version`); if it doesn't, tell the user to install Git.

```
npx -y skills@1.7.0 add "<owner/repo>" -s "<skill>" -g -y -a claude-code
```

   If a skill with the same name is already installed from another source, this would replace it: ask first, and back it up with `node "${CLAUDE_PLUGIN_ROOT}/scripts/skills-offer.mjs" --backup <name> --data "${CLAUDE_PLUGIN_DATA}"`.

5. **Check it landed:** run Step 3 again. The skill must now appear in the list (usually at `~/.claude/skills/<skill>/SKILL.md`). A newly installed skill works in the current session; load it by opening that `SKILL.md` (Step 6). If the install failed or the skill is not listed, show the user the error line and offer `Try another` / `Skip this part`.
6. **Continue** with Step 4 for the remaining parts.

## Step 6 - Use the chosen skills

- **Load each chosen skill** by invoking it by name. If that isn't possible, open its `SKILL.md` from the path in the list and follow it.
- **Keep each skill to its own part.** Don't let it change parts it wasn't chosen for.
- **Load at most 4 skills per task,** because each one costs tokens. On your own, scout loads the matched skills without asking and lists them in the Step 7 report; in an artifact-parity build or design the caller asks first (Step 4b). If more parts match, keep the ones that matter most and say which were left out.
- **When advice conflicts,** apply this order:
  1. the user's instructions
  2. the calling skill's rules (for example artifact-parity's exact-copy rules)
  3. a chosen skill's advice

## Step 7 - Save choices and report

1. **Save:** update `${CLAUDE_PLUGIN_DATA}/skill-choices.json` with this task's choices. Store the skill name, or `"skip"`, for each part label; a design run stores its labels as `design/<label>`. Save only what the user chose or confirmed. Keep the existing entries.
2. **Report:** show the user one short block, then continue with the task:

```
Skills for this task:
- styling: Tailwind v4 -> tailwind-v4 (your skill)
- animation: GSAP ScrollTrigger -> none (skipped by you)
```
