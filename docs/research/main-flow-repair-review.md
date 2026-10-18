# Independent review: main user flows after reported UI failures

Reviewed on 2026-10-18 using native Chrome on macOS. This round is **finding-bearing**: one real form-validation defect was found, repaired by the main session, and successfully retested. The final scoped run completed without another reproducible application defect. This is not a replacement for a fresh independent review.

## Finding and repair

**MF-1 — default context settings cannot be saved with native validation (fixed).** The proposed default `750000` was used with `<input type="number" min="2048" step="1000">`. Its valid sequence starts at 2048, so 750000 is a step mismatch. A normal Save or `requestSubmit()` is blocked before the handler runs; directly calling `onsubmit` would miss this. Main session changed the step to 1. The final browser run verified `form.checkValidity()`, used `requestSubmit()`, and then closed, reopened and reloaded the app to verify the saved value and image preset.

## Main-path evidence

The fixture imports the actual production index, bootstrap, app, styles, storage, provider and MCP modules. It uses a dedicated localhost origin and namespaced native IndexedDB databases. It does not replace the application database with an in-memory implementation.

| User journey | Observed outcome |
| --- | --- |
| Open Harness, create a session | The session appears in the saved list and opens a conversation. |
| Open settings, save 750k and a JPEG quality preset | Native form validation accepts it; saved values survive reopening and a real document reload. The old target/local-extraction controls are absent. |
| Add an API, get models, save, send a message | The production provider adapter requests a synthetic model list; the profile saves, appears in selection and sends a conversation request whose response is displayed. |
| Open devices and skills after connection closure | Native IDBDatabase handles are explicitly closed. Settings Save, Devices, Skills and New session recover on subsequent UI requests; existing content remains. |
| Open local skills and community | Built-in skills render. The market requests the fixed website endpoint and renders the synthetic catalog. There is no editable community endpoint field. |
| Add two MCP servers | Two named independent entries connect, list tools and persist when settings reopen and the page reloads. This main-path test does not itself exercise an LLM tool-call round trip. |
| Export and import a session | Export uses the real session-menu handler and generated JSON Blob; import uses the list-menu handler, a File and DataTransfer. The imported conversation includes the model reply and survives reload. OS file picker and download delivery are intentionally intercepted. |
| Scroll the settings panel | The close button remains within the phone-sized viewport and hit-testable. Separate native mouse scrolling through the two MCP cards and clicking X closed the panel. |
| Brand and top navigation | At 320, 390 and 430 CSS px, the brand stays on one line within the viewport. Native screenshots show the common logo. The homepage header has a visible Harness link; native clicking enters Harness. |
| Enter the page | The app requests browser storage persistence on entry. The fixture returns false, exercising the denied/unavailable path without changing actual browser permissions. |

The complete synthetic journey ended with no unhandled browser error. It contains 34 assertions, but the useful evidence is the connected journey above, rather than the assertion count.

## Scope and reproduction

Run `python3 tests/browser/main-flows-server.py`, open `http://127.0.0.1:18952/tests/browser/main-flows.html` in Chrome, and click **Run primary flows**. The server binds only localhost with a 128-connection backlog. The button resets only databases prefixed `primary-flow-repair:` on this isolated origin. **Remove disposable fixture data** deletes only that fixture's databases and locale setting.

Only iOS identification is simulated to expose the mobile UI; real Safari, physical screen capture, background scheduling, LAN access, HID input and phone permission dialogs are not accepted by this review. Model, community and MCP network responses are synthetic. No real API credential, phone action, firmware upload, workflow or deployment was used. Chrome's password-save suggestion for the synthetic test value was declined. After verification, the fixture's database cleanup button confirmed removal; the sole test tab was closed and the localhost server stopped. Existing user tabs were preserved.

The first fixture attempts exposed fixture-only issues: srcdoc did not match the application's base route, URL objects needed handling in the fetch stub, and reload checks had to await the iframe load event before inspecting a new document. These were corrected before the final pass; none was reported as an application finding. A transient brand assertion against the old document was discarded and rerun after the load synchronization fix.

## Reviewed file snapshot

| File | SHA-256 |
| --- | --- |
| `apps/web/app.js` | `f68f40c68057e63099abe005e314886566547adf805b189f69c490cb9ae0bef3` |
| `apps/web/index.html` | `148699d835add6171299d66e0810434fd23666b2725640934e0c95653d07fd29` |
| `apps/web/styles.css` | `4d92ac017bba403e2f67ed33c77f7ae5ffe246164f412c50c0f6ed860da6fce0` |
| `apps/web/core/store.js` | `bf3a44cff374b88b8f443497826ff75a0f5cdfaa62ba61040e8dc2f4d06a15fb` |
| `apps/web/ui/mcp-settings.js` | `88f0e8f6aa1d74687dd221da81867153d722d8b3fb579077a1dbcc808cca5af2` |
| `tests/browser/main-flows.html` | `ec299af14c132d11d996a83544da39510db2b624890df3116edfe1e3f11e97f5` |
| `tests/browser/main-flows-server.py` | `0ec3807b7df8687a2921a6014667cdaf5f91224792faef418b062e679b4d9fb1` |
