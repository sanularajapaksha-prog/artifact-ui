---
name: statusbar
description: Turn the artifact-parity live progress bar at the bottom of Claude Code on or off. Run only when the user asks for it.
argument-hint: on | off
disable-model-invocation: true
---

# Status bar on/off

The bar shows the current artifact-parity run at the bottom of Claude Code, for example:
`▸ parity · pricing-page · 6/9 Pass 1 build · section 3/7 · 6m12s`

It is empty when no run is active. It stays visible for 10 minutes after a run finishes or stops.

Requested: `$ARGUMENTS` (`on` or `off`; if empty, ask which).

## Turn on

1. **Preview the change.** Nothing is written in this step:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/statusline-setup.mjs" --on --data "${CLAUDE_PLUGIN_DATA}" --plugin-root "${CLAUDE_PLUGIN_ROOT}" --dry-run
```

2. **Tell the user** which settings file changes, and show them the old and new `statusLine` value.
3. **If the script exits with code 3,** the user already has their own status bar.
   - Ask whether to replace it.
   - Explain that `/artifact-parity:statusbar off` puts their original bar back.
   - Continue only if they say yes, adding `--replace` to the command in step 4.
4. **Apply**, only after the user agrees:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/statusline-setup.mjs" --on --data "${CLAUDE_PLUGIN_DATA}" --plugin-root "${CLAUDE_PLUGIN_ROOT}"
```

5. **Tell the user** the bar appears after their next message.
   - If it doesn't appear, a project's own `.claude/settings.json` may set a different status bar that takes priority in that project.
   - A backup of the settings file sits next to it as `settings.json.bak-parity-<time>`.

## Turn off

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/statusline-setup.mjs" --off --data "${CLAUDE_PLUGIN_DATA}"
```

This restores the status bar the user had before, or removes the bar if there was none. If the current bar isn't the artifact-parity one, it changes nothing.
