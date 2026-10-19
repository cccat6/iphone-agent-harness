# Credentials, reasoning effort, titles and navigation — 2026-10-19

## Diagnosis and fixes

The reported phone HTTP 401 cannot be attributed conclusively without reading that browser's credential record; this run did not access it. Source review nevertheless found two concrete defects in our handling: API inference selected a memory key using stale subscription `accountId` metadata instead of the API profile ID, and a missed startup restoration could send a request without the browser's saved key. The resolver now uses the API profile ID and lazily restores its browser-local record before inference. Existing keys and encrypted records are not deleted or replaced on failure.

For official authenticated services, missing or locked credentials fail locally with actionable messages before an empty authentication request. Previously encrypted records remain recoverable; a passphrase was never stored, so those records cannot honestly be decrypted automatically. Custom compatible endpoints that deliberately require no key remain supported. Remote HTTP 401, 402 and 403 have separate authentication, payment and permission diagnostics; a returned 401 is no longer described as a generic quota or CORS issue.

The editor's blank-secret save retains the existing key and can migrate an already unlocked page-memory key into its separate browser-local record. It preserves the model, reasoning default and old encrypted backup. No credentials are added to session exports.

## User-visible behavior

- Reasoning effort appears beside model selection when the catalog or a supported model definition provides valid choices. Its value is saved per session, account and model. Auto omits additional reasoning fields. Catalog metadata survives discovery, editor save and reopening.
- DeepSeek compatible API, OpenAI API, Anthropic API and Codex subscription use their respective supported parameter shapes. Unknown models are not assigned speculative settings. [DeepSeek reference](https://api-docs.deepseek.com/guides/thinking_mode/), [Anthropic reference](https://platform.claude.com/docs/en/build-with-claude/effort), [OpenAI reference](https://developers.openai.com/api/docs/guides/reasoning).
- New conversations generate a short title from their first request after the first successful main response. A small separate request runs without blocking the task; a provisional local title is retained on failure. Existing/imported titles and manual renames are protected atomically from delayed results. Title generation receives no screenshots or conversation history.
- Skills is removed from conversation actions and remains in the global settings screen.
- The screen-sharing status uses larger text and adjusted bottom spacing. The search field has a brief reveal transition, disabled by reduced-motion preferences.

## Back and Forward contract

All normal internal navigation uses one document and records only view IDs in History API state. Navigating does not recreate the capture or bridge owner.

| Current screen | Back result |
| --- | --- |
| Conversation | Previous list/view |
| Settings root | Underlying conversation or list |
| Account/API list or another settings section | Settings root |
| Account/API editor | Account/API list |
| Saved account/API editor | Returns to list; a further Back returns to settings root |
| Conversation actions / rename | Underlying conversation |
| Skill list, details, authoring or sharing | Previous view; tab switches replace the current skill-list entry |
| Website home / community route | Previous internal route |

Forward restores the recorded view. Returning to an already open conversation preserves pending streamed output and pause state. Newer navigation fences delayed history/settings reads. Deleted conversation IDs fall back to the list. Delayed close events from old dialogs cannot dispose a newly reopened view.

This contract covers internal one-document navigation. Browser reload, closing a tab, entering another document directly, or leaving the page ends the document's recording/RTC lifecycle; it does not promise that browser-owned screen-sharing permission survives a new document.

## Executed checks

- Full web suite: **719 passed, zero failed**.
- Independent [first review](auth-navigation-independent-r1-20261019.md) and [second review](auth-navigation-independent-r2-20261019.md), including real discovered regressions and post-fix checks.
- [Real DeepSeek Flash functional results](auth-effort-real-provider-20261019.json): saved credential, database close/reopen and cleared memory, obsolete subscription ID, production Harness request with low effort returned HTTP 200; title generated; Anthropic-style low-effort request also returned HTTP 200. Four network requests total: model catalog plus three inference calls. No phone control or screen images.
- Native Chrome isolated fixture: selected High effort, Back to list, Forward restored High and the conversation; settings → account list → editor → browser Back/Back/Forward/Forward; Save → account list → Back/settings → close/list; website home → Back/Harness. Simulated sharing remained true and document-exit count stayed zero throughout.
- Real IndexedDB and production-header regressions verify key identity, retention, missing/locked paths, explicit custom keyless compatibility and absence of credentials in exports.
- Firmware source and all four sealed binaries unchanged; verified and reused. No serial port, HID input, firmware flash or GitHub Action was used.

The browser fixture establishes actual DOM/history behavior with synthetic sharing, not physical iPhone capture/RTC persistence. The remaining phone checks are to retry the originally failing API connection and swipe Back/Forward while its real sharing and bridge connection are active.

## Final publication

Worker deployment `cbf9fdc0918c4e24ac5c7e3fa1aff40d` serves the final site. [Online verification](auth-navigation-release-site-20261019.json) matched **159 of 159** files against the final build. Firmware binaries are unchanged and verified; no new compilation, flashing or GitHub Action was required.
