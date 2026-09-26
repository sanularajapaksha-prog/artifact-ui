# Changelog

All notable changes to `artifact-parity`. Reconstructed from the tagged git history; each heading links
to its tag. Entries are written from the user's side — what changed for someone running a build.

The reasoning behind the bigger changes is in [docs/DECISIONS.md](docs/DECISIONS.md).

---

## v0.10.0 — Design an artifact from plain words, then build it

- **New `/artifact-parity:design`.** Describe the UI you want and where it goes (redesign a part you
  have, a new part in your frontend, or a standalone page). It reads your project's tokens and fonts,
  asks once, prints a design direction, writes the page, checks it in a real browser at three widths,
  critiques and fixes it, checks that it renders the same every time, publishes it and hands it to the
  build with the place already filled in. It never touches your app's code. — D18
- **Skills are confirmed, never used silently.** Both the design and the build ask you, in their one
  question round, which of the matched skills to use; when one of the plugin's recommended skills and
  one of yours cover the same part, you choose (ours first, the others by skills.sh install count). — D19
- **Recommended skills offer (`/artifact-parity:skills`).** The first session after installing shows the
  design skills the plugin recommends, plus three optional plugins, and installs only what you pick.
  Same-name skills from another author are never replaced without asking and are backed up;
  `/artifact-parity:skills remove` removes only what the plugin installed. — D19
- **Light only.** When the artifact has a dark theme and your app has none, the build asks whether to
  skip dark mode; skipping leaves it out of the build and the score. — D10 note
- **A changed artifact is rebuilt.** Re-running the build on a design republished to the same link (or
  a file edited in place) now uses the new version instead of the saved copy. — D15 note
- **Honest about what isn't measured.** The final result names techniques the check can't verify
  (GSAP, scroll-linked motion, canvas, video) and fonts the reference page failed to load.
- **Steadier captures.** Scrolling during capture no longer races `scroll-behavior: smooth` or skipped
  frames, which made scroll reveals flaky, and the hover pass waits for the page to render before it
  points at an element, which sometimes skipped a hover state.
- Added `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/DEVELOPMENT.md`, this
  changelog, and `fixtures/capture/` (probe pages plus a noise check for `capture.mjs`).
- Ships the edits that had landed after `v0.9.0` was cached (see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)
  section 2).

## v0.9.0 — Ask every question once after analysis, then run to the end

The run's shape changed. Stage 3 now gathers every fact and asks nothing; stage 4 asks up to eight
questions together, each with a recommendation; stages 5-9 obey those answers and decide the rest
themselves, recording each choice so it is listed at the end. You can answer and walk away. — D4

## v0.8.1 — Report app states not reached apart from design differences

A rule that is correctly ported but only shows in an application state the measured page is not in — a
halo that appears while a job runs — is no longer counted as a design miss. These rows are listed
separately and left out of the score. — D12

## v0.8.0 — Build stage lines from compare's result.json

Scores and row counts in the progress lines now come straight from the measuring script's output rather
than from anything the model wrote. `--note` may add a short reason only. — D3

## v0.7.9 — List named parts with subtree ranges in the reference map

`ref-map.md` lists each named part with the element range it covers, so "only the pricing cards" becomes
something the comparison can enforce exactly. — D10

## v0.7.8 — Scope compare to element ranges and reject unknown scope keys

`compare.mjs --scope` limits scoring to the chosen part. `scope.json` accepts only its six known keys
and rejects anything else instead of ignoring it. — D10

## v0.7.7 — Capture states reached by clicks and list state controls

Parts of an artifact that only appear after a click — a second tab, a preview mode, an open panel — can
now be captured. The reference map lists the controls that reach them. — D11

## v0.7.6 — Measure ::before/::after styles and animations

Rings, halos and shimmers built as pseudo-elements are measured and ported exactly, including their
keyframes and the class that switches them on.

## v0.7.5 — Add a paste login option and wait for each login step to navigate

A fourth sign-in method: an owner-only file you fill in your editor, deleted right after the login. Each
login step now waits for the page to navigate before continuing. — D7

## v0.7.4 — Log in with an env file or found env keys, and ask for the deploy URL

Sign in using an env file you name, or one found by searching the project — only key names are ever
shown, never values. The deployed URL is confirmed and remembered. — D7

## v0.7.3 — Keep every change inside the frontend app and prove it

A git snapshot is taken before building and checked afterwards, so a run can prove it changed nothing
outside the frontend. A revert never touches work you had already left uncommitted. — D5

## v0.7.2 — Use the values the user states over detection

Anything you state — the container, the service, the app folder, the URL, the dev or build command —
wins over detection and is remembered for later runs. — D9

## v0.7.1 — Skip the build on a re-check only when data-refs are in the chosen place

A re-run skips straight to measuring only when the built markers are inside the place you chose, not
somewhere an earlier run happened to leave them. — D15

## v0.7.0 — Enhance the existing component in place and detect how the project runs

When a component at the place you name already matches the design, it is changed in place — same file,
same logic, data and handlers — instead of a second copy being built beside it. Project detection finds
the app folder, framework, dev command and Docker service. — D8, D9

## v0.6.1 — Let scout find and install a missing skill from skills.sh

When no installed skill covers a part of the task, scout can search the registry and install the one you
pick — never anything you did not pick. — D17

## v0.6.0 — Add capture and compare scripts to measure parity

The measuring layer. `capture.mjs` renders artifact and build in a real browser and records every
computed style; `compare.mjs` diffs them into ordered categories and writes the report and score. — D13

## v0.5.0 — Add setup, artifact fetch and source check scripts

Browser tooling installs into the plugin's own folder, never your project. Artifact links are fetched in
a real browser, and a source check refuses to build from a summary or a login shell. — D6, D14

## v0.4.0 — Add artifact-parity plugin: build orchestrator, scout and progress status bar

The first release: the orchestrator and worker split, the nine-stage run, the scout skill, and the
progress lines and live status bar. — D1, D2, D16, D17
