# Development

How to change this plugin, test the change, and release it.

---

## 1. Open the repo on its own

This repository has nothing to do with whatever project you were working in. Open it in its own window
so the two never mix:

```bash
code <path to this repo>     # e.g. ~/claude-plugins/artifact-tools
```

- Remote: `https://github.com/sanularajapaksha-prog/artifact-ui.git`
- Branch: `main`
- Public OSS. **Never commit client or employer content here** — no internal URLs, project names,
  screenshots, credentials or real customer code, including inside examples. The publishing commit
  had to go back and neutralise example names across the history — don't create that work again.

---

## 2. The version is the cache key — this is the main trap

Claude Code caches each plugin version in its own folder:

```
~/.claude/plugins/cache/artifact-tools/artifact-parity/
  0.4.0/  0.5.0/  0.6.0/ ... 0.8.1/  0.9.0/
```

**If you edit a file without changing `version`, Claude Code keeps using the old cached copy and your
edit does nothing.** There is no warning. You will read your own new instructions on screen and watch
the old ones run.

### A live example

On the machine these docs were written on, `cache/.../0.9.0/` did **not** match the source at
`v0.9.0`. Five files differed:

```
scripts/capture.mjs
scripts/compare.mjs
skills/build/stages/3-analyze.md
skills/build/stages/4-your-answers.md
skills/build/stages/7-pass2-fix.md
```

The version was bumped to `0.9.0`, the cache was populated, and then more edits landed under the same
version number. **The installed plugin is older than the source.** Bumping to the next version fixes it.

### How to check which copy is actually running

```bash
diff -rq ~/.claude/plugins/cache/artifact-tools/artifact-parity/<version> \
         plugins/artifact-parity
```

Silence means the cache matches your source. Any output means you are testing something you are not
looking at.

---

## 3. The edit loop

The marketplace is installed as a **`directory` source** pointing straight at this folder
(`known_marketplaces.json` → `artifact-tools` → `source: directory`). So you never push to GitHub to
test — but you do have to bump the version.

1. Edit.
2. Bump `version` in `plugins/artifact-parity/.claude-plugin/plugin.json`. During a working session a
   pre-release suffix keeps the real numbers clean: `0.10.0-dev.1`, `-dev.2`, …
3. Refresh and restart:

   ```bash
   claude plugin marketplace update artifact-tools
   claude plugin update artifact-parity@artifact-tools
   ```

   **Then restart Claude Code.** Plugin *agents* are loaded only when a session starts, so
   `parity-worker` will not pick up its new text until you do.
4. Verify with the `diff -rq` above before you trust a test result.

> Unverified: whether `marketplace update` is strictly required for a `directory` source, or whether
> `plugin update` alone re-reads it. Running both is cheap and always correct.

---

## 4. Testing

There is no automated test suite. Verification is running a real build against a real artifact.

### Fast checks — seconds, no browser

Every script is a plain CLI with its usage in a header comment and documented exit codes:

```bash
cd <any project>
node <PLUGIN>/scripts/detect-project.mjs --project .          # 0 found · 1 no UI app · 2 usage
node <PLUGIN>/scripts/check-source.mjs --file some.html       # 0 real · 1 not real · 2 usage
node <PLUGIN>/scripts/list-skills.mjs --json
node <PLUGIN>/scripts/progress.mjs show
PARITY_ASCII=1 node <PLUGIN>/scripts/progress.mjs start 3     # check the ASCII fallback
node <PLUGIN>/scripts/skills-offer.mjs --self-test            # the offer logic, in temp folders
PARITY_OFFER_SIMULATE_MISSING=impeccable node <PLUGIN>/scripts/skills-offer.mjs --hook --data <tmp>
                                                              # see the session-start offer without uninstalling anything
```

### Capture noise check - a minute or two, needs the plugin's browser

```bash
node fixtures/capture/noise.mjs js.html "scroll.html?smooth=1" css.html loader.html
```

Captures each probe page twice and compares the two. Run it before and after any change to
`capture.mjs`; pass `--scripts <dir>` to run an older copy of the scripts for a baseline. What each page
probes, and what the capture cannot measure, is in [fixtures/capture/README.md](../fixtures/capture/README.md).

### The real check — a full build

Keep a small throwaway frontend (Vite + React is enough) and a saved artifact file, and run:

```
/artifact-parity:build ./fixtures/artifact.html build all of it on the home page
```

Watch for the things that break most often:

| Watch for | Why it breaks |
|---|---|
| A stage line the orchestrator printed but the worker did not return | `SKILL.md`'s parser and a stage file's output drifted apart |
| A score in a `--note` | D3 violated — notes may carry a reason only, never a number |
| A question outside stage 4 | D4 violated — stages 5-9 must decide and record a `decision` |
| `scope-guard --check` reporting files outside the app | D5 violated — find which stage wrote them |
| A stage file that reads correctly alone but fails in a run | D2 — it probably leans on text from another stage file |

### After changing a script's output shape

The stage text is a script's only caller. Grep before you ship:

```bash
grep -rn "detect-project.mjs" plugins/artifact-parity/skills/
```

---

## 5. Release checklist

1. `diff -rq` clean between cache and source, so you tested what you are shipping.
2. A full build run passes on the fixture.
3. `version` bumped in `plugins/artifact-parity/.claude-plugin/plugin.json` — a **final** number, no
   `-dev` suffix.
4. `plugin.json`'s `description` still matches what the plugin does; it is what users read in the
   marketplace.
5. `README.md` updated if user-facing behaviour changed.
6. `CHANGELOG.md` entry added.
7. `docs/DECISIONS.md` entry added **if a rule changed** — and if you removed a rule, say in the commit
   message why its problem no longer applies.
8. No client or employer content anywhere in the diff.

```bash
git add -A
git commit -m "v0.10.0: <one imperative sentence — what changed for the user>"
git tag v0.10.0
git push origin main --tags
```

Commit subjects follow the existing history exactly: `v<version>: <sentence>`. Check `git log --oneline`.

### Versioning

No formal semver contract, but the history is consistent:

- **Patch** (`0.7.4` → `0.7.5`): one capability or fix inside an existing stage.
- **Minor** (`0.8.1` → `0.9.0`): the run's shape changes — a new stage, a moved question, a new script.
- The plugin is pre-1.0; `0.x` minors are allowed to change behaviour.

---

## 6. Where to change what

| You want to change | Edit | Also check |
|---|---|---|
| What the user sees during a run | `scripts/progress.mjs` | the `PARITY_ASCII` twin for any new symbol |
| A question, its options or its order | `stages/4-your-answers.md` | `analysis.json` in `stages/3-analyze.md` must supply the values |
| What gets measured | `scripts/capture.mjs` | `compare.mjs` categories, and `ref-map.md`'s generator |
| How differences are scored or ordered | `scripts/compare.mjs` | `CATS`; keep the causal order — D13 |
| How the build is written | `stages/6-pass1-build.md` | stages 7 and 8 repeat its rules and must stay in step |
| Project detection | `scripts/detect-project.mjs` | the flag table in `stages/3-analyze.md` |
| Skill matching | `skills/scout/SKILL.md` | `stages/3-analyze.md` calls its Steps 1-4 |
| The worker's reply format | `agents/parity-worker.md` | `skills/build/SKILL.md` parses it — change both |
| The design command | `skills/design/SKILL.md` | its stage names live in `progress.mjs` `RUNS.design`; its handoff BRIEF shape is copied in `stages/3-analyze.md` and `stages/4-your-answers.md` — change all three |
| The recommended skills | `bundle.json` | README "Recommended skills" table; `skills-offer.mjs --self-test` |
| The session-start offer | `hooks/hooks.json`, `scripts/skills-offer.mjs` | the hook must stay silent and exit 0 on any error |

**Rule of thumb:** a stage file and the script it calls are one unit. Changing one without the other is
the most common way to break a run.

---

## 7. Next developments

Roughly in order of value. Nothing here is committed to.

### Known gaps, stated in the README

- **Focus and active states are not measured.** Hover already is, so the state pass in `capture.mjs`
  has the mechanism — it needs the extra states plus rows in the `states` category. This is the most
  visible gap for accessibility-conscious users.
- **States needing typing, dragging or long hover cannot be captured.** Clicks can. A `--type` and
  `--hover-hold` alongside `--click` would cover most of the remainder.

### Reliability

- **A fixture-based test.** `fixtures/capture/noise.mjs` checks capture's stability; a tiny artifact plus
  an expected `result.json` would also catch a broken `compare.mjs` in seconds instead of in a 15-minute
  run. The highest-value item here.
- **A stage-file linter.** Check each stage file for the things that are currently only convention: a
  `progress.mjs start <n>` at the top, a `done`/`fail`/`wait` on every exit path, and no `--note` that
  contains a digit followed by `%` (a D3 violation, mechanically detectable).
- **Cache-drift warning.** Preflight could compare the running copy's version against
  `plugin.json` and warn when they differ — the trap in section 2, caught automatically.

### Capability

- **Adaptive pass count.** Three passes are fixed. Record how many passes runs actually take and stop
  early, or offer a fourth when the score is still climbing steeply.
- **Multi-screen runs.** `design-ref/<screen>/` is already per-screen; nothing yet drives several
  screens from one command.
- **A `--dry-run`** that stops after stage 3 and prints `analysis.json` as a readable plan. Useful for
  trying the plugin on an unfamiliar repo without letting it write anything.
- **Component-library awareness.** In `enhance` mode, a project using shadcn/MUI has its own primitives;
  today the artifact's raw markup always wins, which is correct for parity but sometimes fights the
  project's conventions. There is a real design question here — see D8 before changing it.

### Housekeeping

- `README.md` and the stage files repeat several rules. They must not drift; a check that the README's
  claims still match the stage text would help.
- The pinned deps in `lib/deps.mjs` need a periodic bump — Playwright moves fast, and a stale pin
  eventually fails to download a browser build.
