# Stage 4 - Pick installed skills

Run `progress.mjs start 4`.

**Follow scout.** Open `<ROOT>/skills/scout/SKILL.md` and follow it with these parts:

- the project's UI framework
- its styling system, for example Tailwind with its major version, or CSS modules
- each animation library the artifact uses
- the icon or asset library the artifact uses

**Two overrides, because you are running inside a build:**

1. **Implementation skills only.** Select only implementation skills. Never select design-taste skills; they conflict with exact copying.
2. **Never ask the user directly.** If scout reaches its "ask once about missing parts" step:
   1. Run `progress.mjs wait 4 --note "missing skills: <parts>"`.
   2. Return STATUS `needs-user`, with scout's missing-skill message as the QUESTION. Options: `Installed - rescan` / `Skip these parts`.
   3. When resumed:
      - "rescan" (or "done"): run `progress.mjs start 4`, then list and match again.
      - "skip": save `"skip"` for those parts, as scout describes, then continue.

**On success:**

1. Run `progress.mjs done 4 --note "<chosen skills, or none>"`.
2. Add `skills` to NOTES, as `name = path to its SKILL.md` for each chosen skill.
