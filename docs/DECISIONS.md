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

---

## D16 — `progress.mjs` owns the output format

**Version:** v0.4.0 · **Files:** `scripts/progress.mjs`, `scripts/statusline.mjs`

**Decision.** One script prints every user-visible run line, keeps `.progress.json` for the status bar,
and appends `progress.md`. Nothing else prints run status.

**Consequences worth keeping:**
- `PARITY_ASCII=1` gives a plain-text fallback for terminals without Unicode. Any new symbol needs an
  ASCII twin in the same `G` object.
- The preflight verifies **all ten scripts exist** before anything is built, and distinguishes "this
  plugin version doesn't include them yet" from "plugin files damaged" — because the user's fix is
  different in each case, and "reinstall" is useless advice for the first one.

---

## D17 — Scout is separate from the build

**Version:** v0.4.0, v0.6.1 · **Files:** `skills/scout/SKILL.md`

**Decision.** Skill matching lives in its own skill, usable on its own as `/artifact-parity:scout`, and
stage 3 calls into its Steps 1-4 rather than duplicating the logic.

**Rules that matter:**
- **Implementation skills only, never design-taste skills.** The artifact is the design authority; a
  taste skill would argue with it.
- **Motion is always its own part** whenever the artifact moves at all, named by what it uses *and* how
  this project must write it — for example `animation: CSS @keyframes loops on ::after in React + Tailwind v4`.
- **Nothing is installed that the user did not pick.** Search may propose up to 3 candidates; the user
  chooses.

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
