# Independent review, round 2: authentication, effort, titles and navigation

Date: 2026-10-19

Reviewed the current working tree after `c89d981`, including the first independent review and the production implementation of credential recovery, reasoning settings, automatic titles, view history and dialog cleanup. This reviewer used source inspection and deterministic tests only. No credentials, external API requests, browser automation, serial ports, phone input, deployment or GitHub Actions were used by this reviewer.

## Findings resolved during this review

1. A queued dialog `close` event could run after rapid Back/Forward reopened that dialog. The old panel close handler then invalidated the new view, disposed its device UI or cancelled its asynchronous editor requests. The action close handler could also navigate Back a second time. Both actual-handler regressions failed before the fix. The implementation now ignores cleanup/history effects for a dialog that is already open again; genuine subsequent dismissal still cleans up.
2. The new missing-key guard initially blocked deliberately keyless custom OpenAI-compatible endpoints, which the existing editor and transport permit. The credential resolver now requires a key by default for the three official authenticated hosts, while allowing custom endpoints to determine their own authentication requirements. An existing locked encrypted record still prevents a request and remains intact. A default production Harness regression (with only its global HTTP function replaced) verifies a public custom endpoint receives one request without either authentication header.

## Validation

Focused command:

```sh
node --test tests/web/auth-navigation-independent-r1.test.mjs tests/web/auth-navigation-independent-r2.test.mjs tests/web/credential-recovery.test.mjs tests/web/reasoning-effort.test.mjs tests/web/session-auto-title.test.mjs
```

Result: **37 passed, 0 failed**.

The four new cases in `auth-navigation-independent-r2.test.mjs` exercise the actual queued panel/action close handlers, default production Harness handling of a keyless custom endpoint, and official missing-key/legacy-vault preservation. The other suites cover IndexedDB credential reopen, stale subscription IDs, blank-secret editor saves, model/account/session effort isolation, exact catalog capability metadata, atomic manual-rename protection, bounded title requests, and cancellation of stale historical view reads.

No further blocking finding remained in the inspected scope after these fixes.

## Evidence boundaries

The specific phone's saved records and original HTTP 401 were not inspected, so this review does not establish their exact cause. The separate real-provider report records successful DeepSeek requests using the production resolver after an IndexedDB reopen, but is evidence from the parent session rather than an API experiment performed by this reviewer. Native-browser navigation observations supplied by the parent likewise concern a fixture with simulated sharing. Neither source tests nor those fixture checks establish physical iPhone RTC or recording continuity. Same-document navigation is now explicit; a full browser document unload is outside that continuity guarantee.

## Follow-up: skill child navigation

Inspected the final `returnFromSkillPanel` change. Explicit editor Cancel, creator Back, skill-detail/share Back and successful editor Save use existing view history when the controller is present, with a local-skills fallback for controller-free contexts. Local/catalog tab selection, importing and list updates retain their normal `showSkills` behavior. Three additional actual-source regressions verify the helper calls `navigation.back` rather than reopening the list, both tab handlers retain their distinct tab values, and successful editing refreshes local skill records before returning. The first- and second-round review suites now pass **13/13** cases together. No additional production change was requested by this reviewer.
