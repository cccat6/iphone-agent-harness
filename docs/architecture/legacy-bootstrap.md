# Legacy-browser startup protection

`index.html` loads `bootstrap.js` as a classic ES5 script before starting any ES module. It checks APIs actually used by the modern app, including `replaceAll`, `Object.hasOwn`, `structuredClone`, `AbortSignal.any`, current array helpers, module support and dialogs. Missing baseline APIs do not receive an attempted modern import or a collection of global polyfills. Normal supported runtimes load the original `app.js`, which retains all existing platform and capability checks.

The standalone bootstrap contains eight-language fallback copy and uses independent, conservative CSS. On an unsupported phone or other mobile platform, the Harness root displays a non-dismissable alert with one action to `/main`. The underlying modern UI stays hidden even on browsers without `inert`; Escape, Tab and outside focus cannot expose it. Desktop roots preserve the `/main` default, and desktop-UA iPads stay classified as phones. Legacy hashes and subfolder self-hosting remain supported.

`/main`, `/skills` and `/flash` show readable descriptions, honest browser requirements, real page navigation, GitHub access and a persistent eight-language selector. They do not pretend to offer a functional Skill installation or firmware-writing UI on the legacy path. Locale selection respects the first supported preferred language, Chinese script before region, and the stored `iah.locale` choice. A noscript section gives readable English navigation if JavaScript is disabled entirely.

Module load errors also activate the fallback. A 15-second empty-screen watchdog only applies when module startup never produces visible UI; it does not replace a running modern app. No production UA simulation flag or test-only bypass is added.

## Verification, 2026-10-18

Eight isolated VM/DOM regression tests passed: missing modern APIs; single-action gate and focus lock; all eight localized gates and all three public pages; language preference/script precedence; desktop versus desktop-UA iPad routing; normal module loading versus failure; subfolder/hash normalization; blank-screen timeout.

`tests/browser/legacy-startup-server.py` is a separate loopback-only fixture, excluded from production assets. It serves the real index/bootstrap while injecting a mock iOS 12 UA and removing `replaceAll`. Native Chrome UI verified the root shows only the Simplified Chinese alert and homepage button, and Escape + Tab leave that alert and its focus intact. Direct visits to `/main`, `/skills` and `/flash` all displayed their readable fallback content and navigation. Screenshots are `screenshots/legacy-bootstrap-gate-mock-zh.png` and `screenshots/legacy-bootstrap-main-mock-zh.png`.

Chrome's existing automation/navigation issue prevented claiming a completed button-driven route transition; the handler's target is covered by the regression test and direct route loads were observed separately. This is a mock capability/UA test on current Chrome, not a physical iOS 12 result. All four fixture tabs and the local-only port 18832 server were closed. No model, hardware, public API or production account was contacted.
