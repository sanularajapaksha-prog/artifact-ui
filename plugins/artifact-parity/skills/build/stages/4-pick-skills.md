# Stage 4 - Pick installed skills

Run `progress.mjs start 4`.

**Follow scout.** Open `<ROOT>/skills/scout/SKILL.md` and follow it with these parts:

- the project's UI framework
- its styling system, for example Tailwind with its major version, or CSS modules
- **motion, whenever the artifact moves at all** - search the artifact source for `@keyframes`, `animation`, `transition`, `::before`/`::after` with animation, and animation libraries. Name the part by what it actually uses and how it must be ported in this project, for example `animation: framer-motion springs + stagger`, `animation: GSAP ScrollTrigger`, or `animation: CSS @keyframes loops on ::after pseudo-elements in React + Tailwind v4`. A CSS-only artifact still gets this part; don't drop it because no library is used.
- the icon or asset library the artifact uses

**Two overrides, because you are running inside a build:**

1. **Implementation skills only.** Select only implementation skills. Never select design-taste skills; they conflict with exact copying.
2. **Never ask the user directly.** If scout reaches its "ask once about missing parts" step:
   1. Run `progress.mjs wait 4 --note "missing skills: <parts>"`.
   2. Return STATUS `needs-user`, with scout's missing-skill message as the QUESTION. Options: `Find and install one` / `Installed - rescan` / `Skip these parts`.
   3. When resumed:
      - "find": run `progress.mjs start 4 --note "searching skills.sh"`, then do scout's Step 5b searches. Instead of asking, run `progress.mjs wait 4 --note "pick a skill for <part>"` and return STATUS `needs-user`: the QUESTION is "Which skill should I install for <part>?", options are scout's candidates (`owner/repo@skill · <installs> installs`) plus `Skip this part`. One part per question.
      - a picked `owner/repo@skill`: run `progress.mjs start 4 --note "installing <skill>"`, install it and check it landed (scout Step 5b, steps 4-5), then match again. If it failed, return `needs-user` with the error line and options `Try another` / `Skip this part`.
      - "rescan" (or "done"): run `progress.mjs start 4`, then list and match again.
      - "skip": save `"skip"` for those parts, as scout describes, then continue.

**On success:**

1. Run `progress.mjs done 4 --note "<chosen skills, or none>"`.
2. Add `skills` to NOTES, as `name = path to its SKILL.md` for each chosen skill.
