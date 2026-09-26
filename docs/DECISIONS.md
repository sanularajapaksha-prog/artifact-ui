# Design decisions

Why `artifact-parity` is built the way it is. Each entry names the problem first, because the problem
is the part that gets forgotten — and a rule whose problem is forgotten looks like pointless ceremony
and gets deleted.

**Before removing or loosening any rule below, read its entry.** If the entry's problem no longer
exists, say so in the commit message.

The version column says when the decision landed; `git show <tag>` has the diff.

---

## D1 — The orchestrator does no work

**Version:** v0.4.0 · **Files:** `skills/build/SKILL.md`, `agents/parity-worker.md`

**Problem.** A parity run has to read a whole artifact source, a `ref.json` holding every computed style
of every element at four viewport variants, nine stages of command output, and a report. Done in the
main conversation, that fills the user's context window many times over, and the useful part — "what
happened and what is the score" — is buried in it.

**Decision.** The orchestrator is a printer. It calls the `parity-worker` subagent once per stage group
and prints back the lines it returns. It reads no files, runs no commands, writes no summaries and
announces no plans.

**Consequence.** Everything the orchestrator touches is permanent in the user's conversation;
everything the worker touches is discarded when it returns. So the temptation to "just check one file"
in the orchestrator is exactly the thing that breaks the design.

**Cost accepted.** Each worker call starts blind. The run's entire memory is a 15-line `RUN FACTS`
block, which must therefore be disciplined about what it carries.

---

## D2 — Nine stages in separate files, read one at a time

**Version:** v0.4.0 · **Files:** `skills/build/stages/*.md`

**Problem.** One long procedure loaded at once means the model holds instructions for stage 9 while
doing stage 2, and drifts between them.

**Decision.** One file per stage. The worker reads only the stage it was asked to run.

**Implication for editing.** Each stage file must be **self-contained**. A stage may not depend on text
that lives only in another stage file, because that text will not be in context. Duplicate the sentence
rather than cross-referencing it.

---

## D3 — The score comes from `result.json`, never from a model

**Version:** v0.8.0 · **Files:** `scripts/progress.mjs`, `scripts/compare.mjs`

**Problem.** A model asked to report its own progress reports optimistically. "Looks good", "mostly
matching", a row count that does not match the report — the one number the user actually relies on was
the least trustworthy thing in the run.

**Decision.** `progress.mjs done <n> --from-report <dir>` reads `result.json` and builds the stage line
itself. The worker may pass `--note` with a short *reason* only — **no counts, no percentages, no the
word "clean"**. The stage files say this explicitly, more than once, on purpose.

**Reinforcement in `compare.mjs`:** `100% CLEAN` is only printed when zero design rows remain. If the
arithmetic produces 100 while a row is still open, it is forced down to 99. There is no path to a clean
report other than actually being clean.

**Do not** add a way for the worker to state a score. That is the whole point.

---

## D4 — Ask everything once, at stage 4, then run to the end

**Version:** v0.9.0 · **Files:** `stages/3-analyze.md`, `stages/4-your-answers.md`

**Problem.** The run used to ask as it went. A parity build takes 10-20 minutes, so a question at
minute 12 meant the user had to sit and watch the whole thing. The value of an automated build is that
you can walk away from it.

**Decision.** Stage 3 gathers every fact and **asks nothing** — where a choice is needed it records the
candidates and a recommendation in `analysis.json`. Stage 4 turns those into at most 8 questions, asked
together, each with its recommendation first. Stages 5-9 obey `answers.json`.

**The rule that makes it hold:** after stage 4 the worker **decides rather than asks**. For anything
`answers.json` does not cover, it takes the safe default the stage file names, continues, and adds a
line to `decisions` so the final result lists the choice and the user can undo it. `needs-user` is
reserved for a genuine blocker: a failed login, a build error it cannot fix inside `app_dir`, a stated
value that turns out not to exist, or a confirmed place outside `app_dir`.

**Why recommendations are mandatory.** A question with no recommended answer moves the work back to the
user. Every option list is best-first and the first is labelled `(Recommended)`.

---

## D5 — Frontend only, and prove it with git

**Version:** v0.7.3 · **Files:** `scripts/scope-guard.mjs`, every stage file

**Problem.** An agent given a design task and a whole repository will wander — an API field here, a
compose file there — and the user finds out afterwards. In a shared repo that is unacceptable, and
"I was careful" is not evidence.

**Decision.** Writes are confined to the confirmed frontend app folder plus `design-ref/`. Stage 5 takes
a git snapshot with `scope-guard.mjs --save`; stage 9 runs `--check` and reports the result.

**The subtle part.** The snapshot stores a **content hash per already-dirty file**. Without it, `--revert`
would throw away the user's own uncommitted work along with the run's. `--revert` touches only files
that were clean before the run; files the user had already modified are listed for them to fix by hand.

**When the design needs a backend change,** it is not built. It is reported as
`unwired: needs backend: <what>`.

---

## D6 — Real source only

**Version:** v0.5.0 · **Files:** `scripts/check-source.mjs`, `scripts/fetch-public.mjs`, `stages/2-get-source.md`

**Problem.** `curl` on a claude.ai artifact link returns an empty app shell. `WebFetch` returns a
*description* of the artifact. Building from a description produces something that looks broadly right
and matches nothing — and the failure is invisible until the score comes back low for reasons nobody can
explain.

**Decision.** `check-source.mjs` is a hard gate: it decides whether a file is real markup and styles, or
a summary, a login shell, or an empty download. Failing it stops the run and tells the user to use
claude.ai's Download button and pass the file path instead.

**`fetch-public.mjs`** opens the link in a real browser, finds the artifact's sandboxed frame and saves
its **original document, before scripts ran**. When that cannot be downloaded it saves the rendered DOM
and *says so* (`source_kind: rendered`), because a post-script DOM is a different and weaker input.

**Also checked:** garbled characters. An exact copy would faithfully reproduce mojibake from the source,
so it is reported rather than silently carried into the user's codebase.

---

## D7 — Credentials never touch the chat, a file, or NOTES

**Version:** v0.7.4, v0.7.5 · **Files:** `scripts/capture.mjs`, `stages/4-your-answers.md`, `stages/5-set-up.md`

**Problem.** Every obvious way to handle a login is a leak. Typing a password into the chat writes it to
the conversation history on disk. Putting it in `answers.json` writes it into the user's repository.
Passing it as a command-line argument exposes it in the process list.

**Decision.** Four methods, none of which carries a secret through the model:

1. **Browser window** (recommended) — the user logs in themselves in a real window.
2. **An env file they name** — the plugin reads key *names*, never shows values.
3. **Search the project's env files** — only key names are ever displayed.
4. **The plugin's own login file** — an owner-only empty file, created at stage 4 so its path can go in
   the option, filled by the user in their editor, and **deleted immediately after the login**.

A credential that reaches the worker anyway exists only as the `PARITY_LOGIN_USER` /
`PARITY_LOGIN_PASS` environment of a single command. It is never written to a file, NOTES, a progress
note, or the reply. If a user types credentials into an "Other" answer despite this, stage 4 must
**refuse to use them**, set `login.method` to `login-file`, and tell them where to put them instead.

**What is saved** is the browser *session* — cookies and storage — in `<DATA>/auth/<host>.json`, outside
the user's project. Never a password.

---

## D8 — Enhance in place, never duplicate

**Version:** v0.7.0 · **Files:** `stages/6-pass1-build.md`

**Problem.** Building a beautiful new component beside the working one leaves the user with two: the
old one still wired to the data, the new one pretty and dead. Somebody has to merge them by hand, which
is the work they were trying to avoid.

**Decision.** When a component at the named place already matches the design, it is changed **in place**:
same file, same exports, same logic.

- **Keep:** state, hooks, data fetching, props and their types, event handlers, routing, permissions,
  i18n keys, `data-testid` and accessibility attributes.
- **Change:** markup where layout depends on it, classes, inline styles, tokens, icons, motion.
- **Match by role:** an existing element playing the same role as an artifact element — same label,
  same purpose, same position — takes that element's classes, styles and `data-ref`.
- **Never delete a feature to make a row pass.** Extra things the artifact lacks are kept and restyled,
  and listed as `kept_extra`.
- **Artifact parts with no data** are rendered with the artifact's content and listed as `unwired`.

**`--live-data` follows from this.** An enhanced component shows real records, not the artifact's sample
text, so `compare.mjs --live-data` skips text and size for elements whose content differs. Without it,
every real value would be reported as a mismatch and the score would be meaningless.

---

## D9 — What the user states beats what the plugin detects

**Version:** v0.7.2 · **Files:** `scripts/detect-project.mjs`

**Problem.** Detection is a guess. In a monorepo with four apps, three compose files and a proxy, it is
often a wrong guess — and a user who already knows the answer had no way to say it.

**Decision.** Anything the user states in their brief goes in as a flag — `--container`, `--service`,
`--app`, `--url`, `--dev-command`, `--build-command`, `--up-command` — **wins over detection**, and is
remembered in the `user` block of `.parity-project.json` for later runs. Detection fills in the rest
around it. `--forget` clears it.

**A stated value that turns out not to exist is never silently replaced.** It is recorded under
`problems`, and stage 4 asks about it by name.

**`--container` alone is enough:** its compose labels give the project, the service and the app folder.

---

## D10 — Scope by element range, and reject unknown keys

**Version:** v0.7.8, v0.7.9 · **Files:** `scripts/compare.mjs`, `stages/5-set-up.md`

**Problem.** "Only the pricing cards" has to become something a script can enforce. Scoring the whole
artifact when the user asked for one part produces a low score that means nothing.

**Decision.** `ref-map.md` lists **named parts with their subtree ranges** — `step-tracker [r-023..r-055 · 33]`
— so a part is addressable as a range of element ids. `scope.json` carries it, and `compare.mjs --scope`
limits the comparison to it.

**`scope.json` accepts only these keys:** `brief`, `sections`, `elements`, `clicks`, `build_clicks`,
`note`. Anything else is rejected rather than ignored — a silently ignored scope key is a scope that
quietly does not apply, which is worse than an error.

**Never pick a page-wide wrapper** as the part. The stage file says to choose the smallest named part
holding everything the brief names, and to offer the wrapper as the *second* option.

**Note (v0.10.0): "light only" is a capture flag, not a scope key.** Skipping dark mode for an app that
has none could have been a seventh scope key, but `capture.mjs --light-only` removes the dark variant at
the source: it is never measured, so compare needs no change and the six keys stay as they are.

---

## D11 — Capture states behind clicks

**Version:** v0.7.7 · **Files:** `scripts/capture.mjs`, `stages/3-analyze.md`

**Problem.** Half of a modern artifact is not visible at load: a second tab, a preview mode, an open
panel. Measuring only the load state silently ignores it.

**Decision.** `capture.mjs --click` replays clicks before measuring, and `ref-map.md` lists the **state
controls** it found so stage 3 can recommend which state to capture. `scope.json` carries two separate
click lists:

- **`clicks`** — how to reach the state in the **artifact**
- **`build_clicks`** — how to reach the same state in the **built app**, which is often a different
  control with different text

They are separate because in `enhance` mode the real app's own control is what has to be pressed, and
in `new` mode the preview route may already open in the right state, making the list empty.

**Known limit.** Parts that need typing, dragging or a long hover cannot be captured. Parts behind
clicks can.

---

## D12 — `state not reached` is not a design failure

**Version:** v0.8.1 · **Files:** `scripts/compare.mjs`

**Problem.** Some artifact rules only apply in an application state the measured page is not in — a halo
that shows while a job runs, an error style, a selected row. The CSS is correctly ported and present in
the code, but the measured element does not carry the class. Counted as a miss, a perfectly accurate
build reports as broken, and the next pass "fixes" it by forcing the class on permanently — which is a
real bug introduced to satisfy a false one.

**Decision.** A ninth category, `state not reached`. These rows are **listed but excluded from the
score**. Stage 7 must not edit code for them and must never force the class on. Instead it looks for a
page or click that genuinely reaches the state; if it finds one, it remeasures there. Otherwise stage 9
follows the user's `end` answer: accept them, or ask for a URL where the state is real.

---

## D13 — Categories are ordered by cause, not by importance

**Version:** v0.6.0 · **Files:** `scripts/compare.mjs`

**Decision.** `missing → fonts → theme and tokens → typography → box → layout → states → motion`.

**Why this order.** It is a causal chain. A wrong font changes every text metric, which changes every
box, which moves every layout. Fixing layout rows before typography rows means fixing numbers that are
about to change by themselves — the stage files say so explicitly, because the instinct is to chase the
biggest group first, and the biggest group is usually layout.

---

## D14 — Dependencies install into the plugin's data folder

**Version:** v0.5.0 · **Files:** `scripts/setup.mjs`, `scripts/lib/deps.mjs`

**Problem.** Playwright plus a browser is about 150 MB and a lockfile change. Putting that in the user's
project to run a design tool is not acceptable — it would show up in their diff and their CI.

**Decision.** Everything installs into `<DATA>` — the plugin's own folder — with its own `package.json`
and `node_modules`. Versions are pinned in `lib/deps.mjs`: **playwright 1.63.0, pngjs 7.0.0,
pixelmatch 7.2.0**. `.setup-stamp.json` records what was verified so repeat runs are fast.

**Fallback.** When a proxy blocks the Chromium download, `setup.mjs` uses Microsoft Edge or Google
Chrome already on the machine rather than failing.

---

## D15 — Re-check only when the `data-ref`s are in the chosen place

**Version:** v0.7.1 · **Files:** `stages/6-pass1-build.md`

**Problem.** A re-run should not rebuild what is already built. But the naive test — "does this screen
have `data-ref` attributes?" — is wrong when an earlier run built the component somewhere else. It skips
straight to measuring and scores a component the user is no longer using.

**Decision.** Skip the build only when the in-scope `data-ref` attributes exist **inside the chosen
place** — `target_files` in `enhance` mode, `target` in `new` mode. Attributes in `leftovers` from an
earlier run explicitly do not count.

**Note (v0.10.0): a re-check needs the same source, byte for byte.** Stage 2 used to reuse the saved
`artifact.*` whenever the link or path was the same. A design republished to the same link (or a file
edited in place) then kept the old copy, and this rule could skip the build entirely. Stage 2 now fetches
anyway and compares; only an identical source is a re-check.

---

## D16 — `progress.mjs` owns the output format

**Version:** v0.4.0 · **Files:** `scripts/progress.mjs`, `scripts/statusline.mjs`

**Decision.** One script prints every user-visible run line, keeps `.progress.json` for the status bar,
and appends `progress.md`. Nothing else prints run status.

**Consequences worth keeping:**
- `PARITY_ASCII=1` gives a plain-text fallback for terminals without Unicode. Any new symbol needs an
  ASCII twin in the same `G` object.
- The preflight verifies **all twelve scripts exist** before anything is built, and distinguishes "this
  plugin version doesn't include them yet" from "plugin files damaged" — because the user's fix is
  different in each case, and "reinstall" is useless advice for the first one.
- **Run kinds (v0.10.0).** `preflight --run design` starts a 6-stage design run; a build (the default,
  also for state files written before run kinds) keeps its 9 stages and prints exactly the lines it
  printed before. The stage list lives in one `RUNS` table, so a new run kind never duplicates the printer.

---

## D17 — Scout is separate from the build

**Version:** v0.4.0, v0.6.1 · **Files:** `skills/scout/SKILL.md`

**Decision.** Skill matching lives in its own skill, usable on its own as `/artifact-parity:scout`, and
stage 3 calls into its Steps 1-4 rather than duplicating the logic.

**Rules that matter:**
- **In builds, implementation skills only, never design-taste skills.** The artifact is the design
  authority; a taste skill would argue with it. (Designs are the opposite case: see D18.)
- **Motion is always its own part** whenever the artifact moves at all, named by what it uses *and* how
  this project must write it — for example `animation: CSS @keyframes loops on ::after in React + Tailwind v4`.
- **Nothing is installed that the user did not pick.** Search may propose up to 3 candidates; the user
  chooses.

---

## D18 — Design is a separate command that ends in a build

**Version:** v0.10.0 · **Files:** `skills/design/SKILL.md`, `scripts/progress.mjs`, `scripts/check-source.mjs`, `scripts/capture.mjs`

**Problem.** The build needs an artifact, and many users arrive with only an idea ("a parallax hero with a
loading screen"). Asking Claude for an artifact by hand gives a page that ignores the project's tokens,
uses motion the build can't verify, and has to be carried to the build by hand.

**Decision.** `/artifact-parity:design` turns a plain-words requirement into a published artifact and hands
it to the build.

- **It runs in the main conversation, not through a worker.** Designing is a conversation (a direction,
  feedback rounds, republishing to the same link), and the Artifact tool refuses to publish to an artifact
  the current conversation has not read or published. The cost is context: the page is written here.
  If that proves too heavy, the draft and check can move into a worker later.
- **Taste skills are wanted here** (the reverse of D17). For a redesign or a new part, the project's own
  tokens and fonts beat the taste skill; only a standalone design is free.
- **It never writes app code.** Everything goes to `design-ref/_designs/<slug>/`, proven with
  `scope-guard.mjs`.
- **The page is authored to be measurable:** CSS and WAAPI motion before GSAP, reveals that don't toggle,
  no smooth scroll on `html`, a loader held by the `#hold-loader` hash rather than a visible control (a
  control would be copied into the app; the Artifact frame passes a plain hash but never a query), no
  generated DOM, named parts. The build still can't hold the loader, so check-source lists it as not measured. These rules come from 38 test captures of
  what `capture.mjs` can and cannot measure.
- **It is checked for stability before it is published:** two captures of the final page are compared with
  each other. Any row is something no build could ever match; the design fixes it once, and whatever still
  changes on its own is listed and the handoff warns about it.
- **The handoff passes a local file, not the link.** The build's worker may not be able to open a
  private artifact link. The Artifact tool publishes a fragment (no doctype, head or body) inside its own
  skeleton, so the design writes `design.page.html` with `wrap-page.mjs`: the same fragment in a copy of the
  viewer's skeleton (read back from a published artifact), and the page sets its own base styles; the check and the build both use that file, so they see what the viewer sees.
- **More than one look before publishing, on purpose.** The Artifact guidance suggests one look and then
  publishing. The design does up to two critique rounds because the user asked for them (decision 6 of
  the v0.10.0 plan), and the stability capture is a build requirement, not polish. The BRIEF has a fixed shape
  (`build all of it · enhance <file> on <route> · light only`) that stages 3 and 4 recognise, so the build
  does not ask again for the place and the part.

## D19 — Skills are confirmed, and the recommended ones are offered once

**Version:** v0.10.0 · **Files:** `skills/scout/SKILL.md`, `stages/3-analyze.md`, `stages/4-your-answers.md`, `stages/5-set-up.md`, `bundle.json`, `scripts/skills-offer.mjs`, `hooks/hooks.json`, `skills/skills/SKILL.md`

**Problem.** Scout used a remembered or matched skill without asking, so a skill could shape a run without
the user knowing. And a design is only as good as the taste skills behind it, which most users don't have.

**Decision.**

- **No skill is used without a yes** in a build or a design: the run's one question round lists the
  matched skills (a multi-select question) and asks about conflicts. A remembered choice is only the
  recommendation. `/artifact-parity:scout` on its own keeps its old behaviour (it reports what it used).
- **Conflict order:** in a design, the plugin's own recommended skill is first and recommended; the rest
  follow by skills.sh install count, unknown last; each option shows its installs, its source and "you
  used it before". In a build, the recommended skills never take part: they are all design skills, and D17
  holds.
- **The recommended set lives in `bundle.json`,** not in prose, so the offer, the design and the docs read
  one list. A SessionStart hook (there is no install hook in Claude Code) tells Claude to offer it in the
  first interactive session; it prints nothing when everything is installed or the user answered. It
  cannot tell interactive sessions from automated ones by environment (both inherit the same variables),
  so its message itself tells Claude to do nothing when it cannot ask the user.
- **Installing never destroys.** `skills add` deletes a same-name folder, so a skill from another author is
  never replaced without asking and is backed up to `<DATA>/backup/` first. `remove` touches only what the
  plugin installed.
- **Install counts** come from the search API the skills CLI itself calls, cached for 7 days; any failure
  simply shows "installs unknown". Searches run with telemetry off and never send the user's own words.

---

## Open questions / not decided yet

- **Focus and active states are not measured.** Hover is. Adding them means extending `capture.mjs`'s
  state pass and adding rows to the `states` category.
- **Typing, dragging and long-hover states cannot be captured.** Clicks can. Anything requiring
  sustained input needs a different capture strategy.
- **There is no automated test suite.** Verification today is running a real build against a real
  artifact. See [DEVELOPMENT.md](DEVELOPMENT.md).
- **Pass count is fixed at 3.** Nothing measures whether a 4th pass would help, or whether most runs
  converge at 2.
- **Scroll-linked motion is measured at the top of the page only,** and GSAP or `requestAnimationFrame`
  motion is not measured at all. Measuring at several scroll positions, or with a fixed clock, would
  cover parallax; both need a spike first.
- **Hover detection is occasionally unstable:** two captures of the same page have found 1 and 2 hover
  states. compare only checks the hovers the reference found, so a build capture that misses one shows a
  false row. Waiting for animations to finish before the hover pass (see fixtures/capture/README.md) may fix it.
- **Hover on `::before`/`::after`, reduced-motion variants, `animation-range` and `object-fit`** are not
  compared yet; each is a small addition to `capture.mjs` (see the v0.10.0 research notes in
  `fixtures/capture/`).
