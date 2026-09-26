---
name: scout
description: Pick which installed skills to use for a task, then use them. Use at the start of any multi-step task (building or porting UI, artifact builds, new features, refactors, migrations, tests, documents, deployments) and whenever the artifact-parity build skill starts. It uses installed skills first. When a part of the task has no matching skill, it tells the user exactly what skill is needed and offers to find one on skills.sh and install the one the user picks.
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
- **Limit:** list at most 5 parts.
- **What a part is:** one area of expertise the task needs. Name it with its technology and version when known, for example:
  - `ui-framework: Next.js 15 app router`
  - `styling: Tailwind v4`
  - `animation: GSAP ScrollTrigger`
  - `testing: Playwright`
- **Where to find the technologies:** the request, `package.json`, and, for artifact builds, the artifact's imports.
- **Don't invent parts** the task doesn't need.

## Step 2 - Check remembered choices

Read `${CLAUDE_PLUGIN_DATA}/skill-choices.json` if it exists. It maps part labels to a skill name or to `"skip"`.

- A remembered skill that is still installed is used without asking.
- A remembered `"skip"` means: don't ask about that part again.

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
- **Artifact builds:** when the artifact-parity build skill called you, never select design-taste skills. These are skills that choose palettes, fonts or layouts, or push a "distinctive" look. They conflict with exact copying. Only implementation skills qualify: framework, styling system, animation library, icons, testing.

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

1. **Search** once per missing part, with that part's search words:

```
npx -y skills find <search words>
```

   It prints lines like `owner/repo@skill 15.1K installs` followed by a skills.sh link.
2. **Pick at most 3 candidates per part.** A candidate must clearly cover the part's technology and version (a Tailwind v4 part needs a v4 skill, not a v3 or Expo one). Prefer 1K+ installs and well-known sources. For artifact builds, the Step 4 rule applies: no design-taste skills.
3. **Ask the user to pick.** One question per part. Each option is `owner/repo@skill · <installs> installs`, with the skills.sh link as its description, plus a last option `Skip this part`. If no candidate qualifies, say so and offer only `Skip this part`.
4. **Install only the picked skill:**

```
npx -y skills add <owner/repo@skill> -g -y -a claude-code
```

5. **Check it landed:** run Step 3 again. The skill must now appear in the list (usually at `~/.claude/skills/<skill>/SKILL.md`). A newly installed skill works in the current session; load it by opening that `SKILL.md` (Step 6). If the install failed or the skill is not listed, show the user the error line and offer `Try another` / `Skip this part`.
6. **Continue** with Step 4 for the remaining parts.

## Step 6 - Use the chosen skills

- **Load each chosen skill** by invoking it by name. If that isn't possible, open its `SKILL.md` from the path in the list and follow it.
- **Keep each skill to its own part.** Don't let it change parts it wasn't chosen for.
- **Load at most 3 skills per task,** because each one costs tokens. If more parts match, keep the 3 that matter most and say which were left out.
- **When advice conflicts,** apply this order:
  1. the user's instructions
  2. the calling skill's rules (for example artifact-parity's exact-copy rules)
  3. a chosen skill's advice

## Step 7 - Save choices and report

1. **Save:** update `${CLAUDE_PLUGIN_DATA}/skill-choices.json` with this task's choices. Store the skill name, or `"skip"`, for each part label. Keep the existing entries.
2. **Report:** show the user one short block, then continue with the task:

```
Skills for this task:
- styling: Tailwind v4 -> tailwind-v4 (your skill)
- animation: GSAP ScrollTrigger -> none (skipped by you)
```
