# Diagnosis: Bani AI preview shows the old thinking box

Diagnosis only. No code was changed.

## What I checked
1. **Build log / dev server:** `build-errors.log` is empty, so nothing is failing. Vite 5.4.19 is running ("ready in 643 ms") with no errors after it. No build is stuck.
2. **Type check and production build:** `tsgo --noEmit -p tsconfig.app.json` finished with 0 errors. `vite build` (output to /tmp, project left as is) finished: "built in 31.50s", no errors.
3. **Served module:** `http://localhost:8080/src/pages/Assistant.tsx` contains `ThinkingLine` (6 times) and `BaniOrb` (4 times), and **no `BaniProcessingMark`**. So the dev server is serving the HEAD version.
4. **Other causes:**
   - Only one route renders `/assistant` (App.tsx line 386, pointing to `Assistant`). No other component draws that screen.
   - `public/push-sw.js` has no fetch handler and no caching, so it can't serve old bundles. There is no PWA plugin or caching worker.
   - The manifest only affects installation. It doesn't cache code.

## Most likely explanation
The server and the source are both current, so the old screen is coming from the owner's side. Most likely causes, in order:
- **An old preview tab or browser cache** still running the module set from before the change. An open tab can keep old modules until it is fully reloaded.
- **Not actually the old box:** the new answer card is also a white glass card with the small Bani mark and "Bani" label. As soon as the first word of the answer arrives, the thinking line is replaced by that card, so a fast first chunk can look like the "old box". The thinking line only shows while the reply is still empty (Assistant.tsx line 494).
- **Wrong place:** the published site (khambugroup.lovable.app / khambu.usebani.com) still runs the last published version, which is older, because nothing has been published since.

## Proposed minimal fix (not applied)
1. Ask the owner to hard-reload the **preview** (Ctrl/Cmd+Shift+R), or open it in a private window, and make sure they're not on the published address.
2. If it still looks wrong, record the screen with Playwright while a question is being answered. That shows whether the orb thinking line appears before the answer card. If the "box" turns out to be the answer card arriving quickly, no code fix is needed.
3. No restart, no cache clearing and no code changes are needed based on these findings.
