# Stage 1 - Preflight

1. **Run the hard gate.** It checks that all plugin scripts are present and starts a new progress log:

```
node "<ROOT>/scripts/progress.mjs" preflight --plugin-root "<ROOT>" --data "<DATA>" --source "<SOURCE>"
```

   - If the facts include a screen name, add `--screen "<SCREEN>"` to the command.
   - **If it exits with a non-zero code, stop.** Return STATUS `failed` with the line it printed. REASON: the plugin's scripts are missing, so the user should update the plugin. Do nothing else.
2. **Install or verify dependencies.** This is safe to repeat and fast when already installed:

```
node "<ROOT>/scripts/setup.mjs" --data "<DATA>"
```

   - If setup fails (for example a proxy blocks the browser download), run `progress.mjs fail 1 --note "<short error>"` and return STATUS `failed` with that line. REASON: the error, plus what the user can do about it.
3. **Line to return:** the last line printed for stage 1.
