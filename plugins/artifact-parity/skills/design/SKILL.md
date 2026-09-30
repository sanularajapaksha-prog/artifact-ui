---
name: design
description: Design new UI as a claude.ai artifact from a plain-words requirement (for example a parallax hero with animations and a loading screen), for a redesign of a part of the user's project, a new part to add to their frontend, or a standalone design; gets the skills it needs, checks the page in a real browser, publishes it, takes feedback, then hands it to /artifact-parity:build. Run only when the user types /artifact-parity:design.
argument-hint: <what you want, in plain words> [where it goes]
disable-model-invocation: true
---

# Artifact design

You turn the user's requirement into a polished artifact they will want to build, then hand it to `/artifact-parity:build`. This skill runs in the main conversation, so keep the chat clean: show the stage lines, the one question round, the direction block, the link and the result. Don't paste HTML, command output or file contents into the chat.

**The promise:**

- **Never write the user's app code.** Nothing outside `design-ref/` in the current folder is written (the design itself goes in `design-ref/_designs/<slug>/`), apart from the plugin's data folder and any skill the user picks to install. `/artifact-parity:build` does the app work later.
- **Ask once.** One question round (stage 3), then run to the published link. Feedback rounds after the link are expected.
- **Honest checks.** Every "check passed" comes from a script's output, never from your own judgement of a screenshot.
- **No change-workflow tools.** This run is its own change record: don't start a Specclaw proposal (`/specclaw:propose` or any other `/specclaw:*` command) or any other planning workflow, even when the project's CLAUDE.md or a skill says every change needs one. The user chose this command to make the change. Say so once in the final result ("not run through Specclaw: this was an artifact-parity run").

## Inputs

Arguments: `$ARGUMENTS`

- **REQUIREMENT:** what the user wants, in their words, for example "a parallax hero with animations and a loading screen".
- **WHERE:** the place, if they named one: "redesign the pricing section", "a new hero on the home page", "just a standalone page".
- If `$ARGUMENTS` is empty, take both from the user's message. If there is no requirement at all, ask for it in one line and stop.
- **slug:** a short kebab-case name from the requirement, for example `parallax-hero`. Use it for folder names; the page's `<title>` is a real name (see the rules for the page).

In every command, `<ROOT>` is `${CLAUDE_PLUGIN_ROOT}` and `<DATA>` is `${CLAUDE_PLUGIN_DATA}`; in scout's text, `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_DATA}` mean the same two folders. The progress command is `node "<ROOT>/scripts/progress.mjs" <command> <stage> [--note "..."]`, run from the current folder. Print each line it prints, exactly, on its own line. Never write your own status lines.

## Stage 1 - Preflight

```
node "<ROOT>/scripts/progress.mjs" preflight --plugin-root "<ROOT>" --data "<DATA>" --run design --screen "<slug>"
```

If it fails, print its line and stop. Then:

1. **Browser tooling** (for the check in stage 5; about 150 MB the first time, into the plugin's data folder):

```
node "<ROOT>/scripts/setup.mjs" --data "<DATA>"
```

   If it fails (offline, proxy), don't stop: the design can still be made and published. Remember `no_browser: <reason>`; stage 5 then runs only its steps 1 and 5, and the result says the page was not checked in a browser.
2. **Recommended skills:** run `node "<ROOT>/scripts/skills-offer.mjs" --check --json --data "<DATA>"` and note the design skills that are `missing`. They are offered in stage 3's questions.
3. Print one line: "A first design takes about 15-25 minutes; changes after that take a few minutes each."

## Stage 2 - Read project

Run `progress.mjs start 2`. Gather facts; ask nothing and change nothing.

1. **The app.**

```
node "<ROOT>/scripts/detect-project.mjs" --project "." [flags for anything the user stated: --app, --dev-url, --container ...]
```

   Read the printed line, not just the exit code:
   - `✔ app: ...`: there is a frontend. Its folder is `app_dir`.
   - `? N UI apps found`: several apps. Pick the one WHERE points to. If that's unclear, this is the one exception to asking once: ask `app` on its own first (the best 3-4 folders; the user can type another), rerun this command with `--app <folder>`, then do steps 2-5 for that app.
   - `✖ no UI app found in this project`: there is no frontend here, so the standalone case is likely (still confirmed in stage 3 when WHERE names a place).
   - Any other `✖` line (a value the user stated was not found, or a crash): it becomes a question in stage 3 naming what was not found.
2. **The look, from code** (skip for a standalone design with no app):
   - `package.json`: framework, Tailwind major version, component library (shadcn `components.json`, `@mui/*` ...), animation and icon libraries.
   - Tokens: Tailwind v3 `tailwind.config.*` (`theme`, `extend`, `darkMode`), Tailwind v4 `@theme` blocks, global CSS `:root` and `.dark` variables.
   - Fonts: `next/font` imports in the root layout, `@fontsource/*` packages, `@font-face` rules, Google Fonts links in `index.html`. Note which are Google fonts, and for the others where their font files are in the project.
   - Dark mode: none, media (`prefers-color-scheme`), or class (`.dark`, `[data-theme]`, next-themes).
3. **The place.** Search the router config or pages folder, component file names, page titles, headings and nav labels for the place WHERE names. Record up to 3 place candidates, best first, each `enhance` (an existing component there is being redesigned) or `new` (a new part goes there), with `file` and `route`. Nothing outside `app_dir`.
   - **For a redesign,** read the existing component: its markup, visible text, props, and every feature it has (buttons, states, lists). The design must keep all of them, in the same order, so the build can change it in place without losing anything.
4. **Safety.** If the requirement asks to copy a real company's or person's brand (name, logo, trademarked look) or to make a working login or payment form that imitates a real service, plan a placeholder name and original visuals instead ("in the style of", no logos). If it can't be made safe, stop here with a one-sentence reason: the artifact would be refused at publish time anyway.
5. **Skills.** Follow `<ROOT>/skills/scout/SKILL.md` Steps 1-4 and Step 4b in **design mode**:
   - Design parts from `<ROOT>/bundle.json` `parts`: `direction`, `motion`, `critique`, plus `redesign` whenever any place candidate is a redesign (it is only used if the user ticks it and picks a redesign).
   - Implementation parts the requirement needs, named with their technology, for example `animation: GSAP ScrollTrigger` or `styling: Tailwind v4`.
   - For a part with no installed skill, run scout's Step 5b search (steps 1-2 only: candidates, **don't install**). When a missing part has a bundle skill, that bundle skill is its first candidate.
   - At most 4 skills will be used. Keep the 4 that matter most for this requirement and name the rest as left out.

Run `progress.mjs done 2 --note "<stack, or 'no app'> · <n> things to confirm"`.

## Stage 3 - Your answers

Run `progress.mjs wait 3 --note "<n> questions"`. Ask everything in one round with AskUserQuestion: at most 8 questions, at most 4 per call (a second call for 5-8). Each question has 2-4 options, **your recommendation first, its label ending in "(Recommended)"** (multi-select labels stay exactly as written); the user can always type "Other", so never add an "Other" option. Headers are at most 12 characters. Fill every option with real values.

| id | Ask when | Question and options |
|---|---|---|
| `where` | there are at least 2 options | "Where does this design go?" - the place candidates as `Redesign <file> (<route>)` or `New part at <file> (<route>)`, and `Standalone design (no project)`. With an app but no place found: `New part at <conventional location> (Recommended)` (with the project's look) and `Standalone design`. With no app: `Standalone design (Recommended)` and, only if WHERE named a place, `I'll open the project first`. With only one possible answer, don't ask: use it and say so in the stage 3 line |
| `stated` | a stated value was not found | "<what> was not found. What should I use?" - the likely matches |
| `gap-1`, `gap-2` | the requirement leaves a real choice open that changes the design | For example "The loading screen shows:" - `A progress bar (Recommended)` / `The logo mark, pulsing`. At most 2; never ask about taste, and never offer an option the rules for the page forbid |
| `skills` | skills were matched | "Use these skills for this design?" - multi-select, one option per matched skill (at most 4, the cap from stage 2): label `<skill>`, description `<part> · <installs> installs (or "installs unknown") · <source> · "you used it before" when true`. The user ticks the ones to use; at most 4 are used. With one skill: `Use <skill> (Recommended)` / `Don't use it` |
| `skill-1`, `skill-2` | a part has a conflict or no installed skill | Conflict: "Two skills cover <part>. Which one?" - the candidates in scout Step 4b's order, the first "(Recommended)", each `<skill> · <installs> installs`, plus `No skill for this part`. Missing: "No installed skill covers <part>. Install one?" - up to 3 candidates `owner/repo@skill · <installs>`, the skills.sh link as the description, plus `Skip this part` |
| `bundle` | recommended design skills are missing (stage 1); their parts then get no `skill-N` question | "artifact-parity's recommended design skills <names> are not installed. Install them and use them for this design?" - `Install and use them (Recommended)` / `Not now` |

- **Skills are never used without a yes, and nothing is installed that the user did not pick.** `skills` is never dropped. Over 8 questions: drop `gap-2`, then `gap-1` (use their recommended options), then `bundle` (not now). More conflicts or missing parts than the 2 skill slots: a surplus conflict's recommended skill becomes one more option in the `skills` question (if there is room; otherwise that part gets no skill), and a surplus missing part is skipped. Name both in the `skills` question's text ("also: <part> → no skill").
- A remembered `design/...` choice from scout is only the recommendation; it still appears in the question.

Then act on the answers, without asking again:

- **Installs:** for each picked missing skill, scout Step 5b steps 4-5 (`npx -y skills@1.7.0 add "<owner/repo>" -s "<skill>" -g -y -a claude-code`). If a skill with the same name from another source is already installed, don't replace it (that needs a yes the user hasn't given): skip it, use no skill for that part, and say so in the result. When it lands, add it to the plugin's list with `node "<ROOT>/scripts/skills-offer.mjs" --track <skill> --data "<DATA>"`. For `Install and use them`: `node "<ROOT>/scripts/skills-offer.mjs" --commands --all --data "<DATA>"`, run its `skills` commands, then `--record installed --names <the ones that landed> --data "<DATA>"`, or `--record later --names <the ones that landed>` when any failed. The landed bundle skills count as confirmed for their design parts, within the cap of 4 (the `redesign` skill only for a redesign). For `Not now`: `--record later --data "<DATA>"`. A failed install: go on without it and note it for the result; never install another candidate instead.
- **The case** comes from `where`: `redesign`, `new` or `standalone`. The `redesign` skill is used only when it was ticked and the case is a redesign; no skill is ever added after the answers. `I'll open the project first`: say how to run the same command inside the project, run `progress.mjs fail 3 --note "run it inside the project"`, and stop.
- **Save** the confirmed skills under `design/<label>` keys (scout Step 7).

Run `progress.mjs done 3 --note "<case>: <place or standalone> · <skills in use or none>"`.

## Stage 4 - Direction and draft

Run `progress.mjs start 4`.

1. **Folder and guard.** Create `design-ref/_designs/<slug>/`. Then snapshot git, so stage 5 can prove nothing else changed:

```
node "<ROOT>/scripts/scope-guard.mjs" --save --app "design-ref/_designs/<slug>" --out "design-ref/_designs/<slug>"
```

   If it prints that the folder is not in a git repo, remember `no_git`; stage 5 then says "not proven (no git)" instead of claiming proof.
2. **The Artifact tool.** If you have the Artifact tool, call it first with `action: "quickstart"` and `intent: "other"` (a plain HTML page, not a Design, Docs or Slides type: the build needs real markup), and follow what it returns for the page. Its advice to look once and then publish is replaced here by stage 5, which the build needs. If you don't have the tool, skip this; stage 6 saves the page locally instead.
3. **Load the confirmed skills** (at most 4) by invoking them or opening their `SKILL.md`. Each one applies only to its own part. When advice conflicts: the user, then these rules and the project's own tokens and fonts (redesign or new part), then a skill.
4. **The direction.** Before any code, decide the design and print it as one short block. Don't ask for approval; go straight on to the draft.

```
Direction: <slug>
Concept: <one sentence: the feeling and the idea>
Type: <display font> + <text font> (<why>)   — the project's own fonts for a redesign or new part
Color: <the palette in 3-5 tokens>           — the project's own tokens for a redesign or new part
Layout: <the structure in one line>
Motion: <what moves, how and when; the one signature moment>
Checklist: <each thing the user asked for, as a short item>
```

5. **The draft:** write `design-ref/_designs/<slug>/design.html`, one self-contained page that follows every rule below. Write `design.meta.json` next to it: `{ "requirement", "case", "place": { "mode", "file", "route" } | null, "app_dir", "stack", "dark": "none | media | class", "placeholders": ["texts to replace in the app"], "fonts_self_hosted": ["families the app loads from its own files"], "fallback_fonts": [], "skills": [], "link": null }`.
6. **The full page.** `design.html` is what gets published, and the Artifact tool wraps it in its own document skeleton, so it has no `<!doctype>`, `<html>`, `<head>` or `<body>` of its own. The browser check and the build need the page as viewers get it, so write `design.page.html` from it (in the same skeleton), and again after every change to `design.html`:

```
node "<ROOT>/scripts/wrap-page.mjs" --in "design-ref/_designs/<slug>/design.html" --out "design-ref/_designs/<slug>/design.page.html"
```

   Never edit `design.page.html` by hand.

Run `progress.mjs done 4 --note "direction: <concept in a few words>"`.

### Rules for the page

These keep the page true to the requirement, buildable, and fully checkable by `/artifact-parity:build`.

- **Plain HTML in one file, without a document skeleton:** start with `<title>` and `<style>`, then the content and scripts; no `<!doctype>`, `<html>`, `<head>` or `<body>` tags (the Artifact tool adds them). Set the base yourself, so the page looks the same inside the published frame, which adds a small reset of its own, and in `design.page.html`: `:root { color-scheme: light }` (dark in the dark blocks), `body { margin: 0; font: <size>/<line-height> <your text font>; background: var(--<bg token>); color: var(--<text token>) }`, `img { max-width: 100% }` and `[hidden] { display: none !important }`.
- **All CSS in one inline `<style>`;** no local files, and no stylesheet links except Google Fonts (the Artifact frame blocks every other stylesheet: inline a library's CSS instead). Scripts only from `cdn.jsdelivr.net/npm` or `cdnjs.cloudflare.com` with pinned versions (for example `gsap@3.12.5`). No external images: draw with CSS, SVG or gradients. `<title>` is a distinctive 2-4 word name (for example the placeholder brand and the part, `Keelson Hero`), not a category like "parallax hero"; the slug stays for folders.
- **Only the designed part.** No demo navigation or filler around it. For a new part, show just that part; for a redesign, just the component being redesigned.
- **For a redesign or a new part: the project's look.** Use its token names and values, its fonts and its spacing exactly; the taste skills shape the design within them. Keep every feature, label and piece of content of a redesigned component, in order.
- **Fonts:** Google fonts by `<link>`. A font the app loads from its own files: when its license allows sharing the file (for example OFL fonts and `@fontsource` packages), embed it in the page as an `@font-face` with a `data:` URL (woff2 where there is one), so the check measures the real font, and add the family to `fonts_self_hosted`; the build keeps the app's own loading for it. Otherwise (a commercial license, or no file found) use the family name only, add it to `fallback_fonts` in `design.meta.json`, and say so in the result.
- **Dark mode follows the project.** The Artifact page contract wants dark tokens under `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])`, and again under `:root[data-theme="dark"]`. If the project has no dark mode, give those dark tokens the light values. Never rely on `light-dark()` alone.
- **Placeholder brand.** Use a neutral name and made-up sample content, never real customer data or env values; list the texts under `placeholders`.
- **Motion that can be checked:** CSS `@keyframes` and transitions first, `element.animate()` second. Use GSAP or `requestAnimationFrame` only for what CSS can't do, never for loops, entrances, hovers or counters.
- **Loops** are infinite CSS or WAAPI animations. Never re-create an animation on a timer or on `animationend`, and never change text over time: a count-up shows its final number in the markup and animates only opacity or transform.
- **Complete at rest.** Everything meant to be read is visible once the page has loaded, without scrolling. A scroll reveal starts from a visible state (for example a 24 px rise, or opacity 0.6 to 1), never from `opacity: 0`. Prefer `animation-timeline: view()` with `animation-fill-mode: both` and an `@supports not (animation-timeline: view())` fallback that shows the content. With IntersectionObserver: reveal once, never toggle back. Never set `scroll-behavior: smooth` on `html`.
- **Parallax:** prefer CSS scroll-driven animations, and make the top-of-page state the real resting state. Nothing may sit at `scale(0)` or zero size at the top of the page. A part that only exists on its own needs room to scroll: make the part itself taller than the screen (for example `height: 170vh`) with a `position: sticky` stage inside, and drive the layers from a named `view-timeline` on the part. With GSAP ScrollTrigger: `scrub: true`, no `pin` (use `position: sticky`).
- **Loading screen:** dismissed on the window `load` event (removed right away or within 300 ms, not on `transitionend`), never on a longer timer. Keep it on screen when `location.hash` is `#hold-loader`, so stage 5 and the user (on the published link plus `#hold-loader`) can look at it; the Artifact frame passes a plain hash but never a query. Never add a visible control just for the design.
- **No generated DOM:** a `<canvas>` sits in the markup with an id and is passed in (`new THREE.WebGLRenderer({ canvas })`); split text is written in the markup; nothing is added or removed on timers.
- **Hover:** CSS `:hover` on the element itself, changing color, background, border color, box-shadow, opacity, transform, text decoration or outline color. Transitions of 1 s or less; no infinite animation on hover; no JS hover tweens. Draw underlines and glows with box-shadow or text-decoration on the element rather than `::before`/`::after`.
- **Every other state** (menu open, tab, modal) sits behind a visible button, tab or link with short unique text.
- **Name every part:** each section has a heading or `aria-label`; each group of 5 or more elements has an `id` or `aria-label`. Text lives in the markup. Write `@keyframes` by hand in plain CSS, defined for all widths (vary distances with custom properties, not width-only animations). SVG: animate the `<svg>` element or a wrapper, never inner shapes, and no SMIL.
- **Reduced motion:** one `@media (prefers-reduced-motion: reduce)` block that only switches motion off or shortens it.
- **Never write `data-ref` or `data-pr` attributes;** the build adds its own.

## Stage 5 - Check

Run `progress.mjs start 5`. With `no_browser`, run steps 1 and 5 only, then `progress.mjs skip 5 --note "no browser: <reason>"`, and go to stage 6.

1. **Real markup:**

```
node "<ROOT>/scripts/check-source.mjs" --file "design-ref/_designs/<slug>/design.page.html"
```

   `✖`: fix the page and run it again. Keep its `⚠ not measured by the parity check: ...` line for the result.
2. **Look at it.** Capture once:

```
node "<ROOT>/scripts/capture.mjs" --data "<DATA>" --mode ref --target "design-ref/_designs/<slug>/design.page.html" --out "design-ref/_designs/<slug>/check"
```

   - `⚠ page errors`: fix them. `⚠ fonts not loaded`: fix the font link or the embedded font.
   - View `check/ref-1440.png`, `check/ref-768.png` and `check/ref-390.png` (and `check/ref-1440-dark.png` when present). A section revealed on scroll can look empty in a full-page screenshot; judge those from the code, not the picture.
   - With a loading screen, capture once more with the loader held, into `check-loader`, and view `check-loader/ref-1440.png`. A hash needs a `file://` URL as the target; print it with:

```
node -e "console.log(require('url').pathToFileURL(process.argv[1]).href + '#hold-loader')" "design-ref/_designs/<slug>/design.page.html"
```
3. **Critique, then fix.** Go through the loaded critique and taste skills' checklists, and always this list:
   - Every **Checklist** item from the direction is visibly there.
   - One clear focal point per screen; a consistent type scale with at most 2 families; spacing on a steady rhythm.
   - Text contrast at least WCAG AA; nothing overflows at 390; tap targets at least 44 px on mobile.
   - Every animation has a purpose; entrances ease out; UI transitions about 150-400 ms; the reduced-motion block works.
   - It does not look like a template: a distinct idea, not generic cards on a gradient.

   Fix what you find and capture again. At most 2 fix rounds.
4. **It must be stable.** Once the page is final, capture it twice and compare the two captures; any row is a part that changes on its own, which no build can match:

```
node "<ROOT>/scripts/capture.mjs" --data "<DATA>" --mode ref --target "design-ref/_designs/<slug>/design.page.html" --out "design-ref/_designs/<slug>/check-a"
node "<ROOT>/scripts/capture.mjs" --data "<DATA>" --mode ref --target "design-ref/_designs/<slug>/design.page.html" --out "design-ref/_designs/<slug>/check-b"
node -e "require('fs').copyFileSync(process.argv[1], process.argv[2])" "design-ref/_designs/<slug>/check-b/ref.json" "design-ref/_designs/<slug>/check-a/build.json"
node "<ROOT>/scripts/compare.mjs" --dir "design-ref/_designs/<slug>/check-a"
```

   If rows remain, fix their cause with the motion rules above and run this step once more. Rows that still remain are listed in the result as "changes on its own", and the handoff warns that the build will report them as differences it cannot fix.
5. **Nothing else changed:**

```
node "<ROOT>/scripts/scope-guard.mjs" --check --app "design-ref/_designs/<slug>" --out "design-ref/_designs/<slug>"
```

   Exit 1 lists files changed outside `design-ref`: undo them with `--revert` (same flags) and say so in the result. With `no_git`, the result says "not proven (no git)".

Run `progress.mjs done 5 --from-report "design-ref/_designs/<slug>/check-a"` (the line's numbers come from `result.json`; never add counts to it yourself).

## Stage 6 - Publish

Run `progress.mjs start 6`.

- **With the Artifact tool:** publish `design-ref/_designs/<slug>/design.html` as the page, following the tool's rules (the page's `<title>` as the title, a one-word icon, a one-sentence description). If it refuses, give the one-sentence reason and keep the local file. Save the link in `design.meta.json` under `link`.
- **Without it:** open `design.page.html` in the user's browser (`Start-Process "<file>"` in PowerShell or `start "" "<file>"` in cmd and Git Bash on Windows, `open "<file>"` on macOS, `xdg-open "<file>"` on Linux). The link is its full path.

Run `progress.mjs done 6 --note "<the link>"`, then print one short block:

```
🎨 <slug>: <the link>
In it: <each Checklist item>
Not measured by the build check: <the check-source list, plus anything from the rules you could not avoid, for example GSAP parallax distance>
Replace in your app: <placeholders>
Changes on its own: <rows from stage 5 step 4, if any>
Not checked: <only with no_browser: "no browser (<reason>)">
Fallback font in the check: <fallback_fonts, if any>
Build it with: <the build command (see "Feedback and handoff")>
```

Leave out a line that has nothing to say. With a loading screen, add: "To see the loading screen, open the link with #hold-loader at the end."

## Feedback and handoff

Ask once with AskUserQuestion, header `Next`:

- Redesign or new part: "How does it look?" - `Build it into the app (Recommended)` — runs `<the build command>` (when rows changed on their own, say the build will report them) / `Change something` — type what to change / `Keep it, build later` — you get `<the build command>` to run yourself
- Standalone: "How does it look?" - `Keep it (Recommended)` — you get `<the build command>` to run later inside a project / `Change something`

`<the build command>` is the full `/artifact-parity:build ...` line from below, written out in the option's description so the user sees exactly what will run.

**Change something:** apply the change to `design.html`, write `design.page.html` again (stage 4 step 6), run stage 5 again (for a small change, steps 1, 2 and 4; with no_browser, steps 1 and 5), republish to the same link (publish the same file again), and ask again. Each round prints the stage 4-6 lines again.

**Build it into the app:** invoke the `artifact-parity:build` skill with the arguments

```
design-ref/_designs/<slug>/design.page.html build all of it · <enhance <file> | new at <file>> on <route>[ · light only][ · fonts: <family> from the app][ · fallback font: <family>]
```

- Add ` · light only` when the project has no dark mode, ` · fonts: <family> from the app` for each family in `fonts_self_hosted`, and ` · fallback font: <family>` for each in `fallback_fonts`.
- The source is `design.page.html`: the published page inside a complete document, like the one the Artifact frame gives it. The build's helper may not be able to open a private link, and a local file also works offline.
- The build still asks its own questions, including which skills to use for building.

**Keep it, build later:** print that same command as `/artifact-parity:build <arguments>` for the user to run inside the project. For a standalone design there is no place yet, so print `/artifact-parity:build <the link, or the full path of design.page.html> build all of it` and tell the user to add where it goes in plain words.
