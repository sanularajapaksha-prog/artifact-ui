# Stage 3 - Understand the target project

Run `progress.mjs start 3`.

**Read the project.** Read `package.json`, and the lockfile only if exact versions matter. Note:

- the framework (Next.js, Vite or other) and the router
- Tailwind and its major version
- the CSS approach and any component library
- animation libraries (framer-motion / motion, gsap) and the icon library
- the dev-server command and port

**Set up the target:**

- **Component location:** if the BRIEF says where the UI goes (a page, a route, a folder), that is the target. Otherwise follow the project's existing conventions.
- **Preview route:** mount the screen on a temporary preview route (for example `/parity/<screen>`) that renders only this screen, with no app header, sidebar, or login gate. Measuring always happens here, even when the target is another page, so the app shell can't shift the numbers.
- **Missing libraries:** if the artifact uses a library the project lacks (same icon set, same animation library), the right fix is to install that same library rather than hand-recreating its output. Never install without the user's yes:
  1. Run `progress.mjs wait 3 --note "install <library>?"`.
  2. Return STATUS `needs-user`. The QUESTION names the library and why it is needed. Options: `Install it` / `Don't install`.
  3. When resumed with the answer, run `progress.mjs start 3` and continue.
- **Dev server:** start it in the background, or reuse it if it is already running. Check that the preview URL loads.

**On success:**

1. Run `progress.mjs done 3 --note "<framework>, <styling> · target: <where the UI goes>"`.
2. Add these to NOTES: `stack`, `dev_command`, `preview_url`, `target`, `libraries`.
