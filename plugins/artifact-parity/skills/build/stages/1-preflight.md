# Stage 1 - Preflight

1. **Run the hard gate.** It checks that all plugin scripts are present and starts a new progress log:

```
node "<ROOT>/scripts/progress.mjs" preflight --plugin-root "<ROOT>" --data "<DATA>" --source "<SOURCE>"
```

   - If the facts include a screen name, add `--screen "<SCREEN>"` to the command.
   - **If it exits with a non-zero code, stop.** Return STATUS `failed` with the line it printed, and do nothing else. Base REASON on the line's wording:
     - **"not in this plugin version yet":** REASON is "This plugin version doesn't include its measuring scripts yet, so the run stopped before building anything. Nothing is wrong with your install; git pull or reinstalling won't help. Wait for the next plugin version."
     - **"plugin files damaged":** REASON is "Some plugin files are missing. Reinstall the plugin, restart Claude Code, and run the command again."
2. **Install or verify dependencies.** This is safe to repeat and fast when already installed:

```
node "<ROOT>/scripts/setup.mjs" --data "<DATA>"
```

   - If setup fails (for example a proxy blocks the browser download), run `progress.mjs fail 1 --note "<short error>"` and return STATUS `failed` with that line. REASON: the error, plus what the user can do about it.
3. **Line to return:** the last line printed for stage 1.
