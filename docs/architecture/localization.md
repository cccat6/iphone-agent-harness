# Localization and repository languages

The Web UI supports eight locales: `en`, `zh-Hans`, `zh-Hant`, `ja`, `ru`, `de`, `fr` and `es`. The repository's primary README and GitHub description use English. Seven linked README translations are maintained under `docs/readme/`; readers select them explicitly.

## Website selection

`apps/web/i18n.js` exposes the supported locale list and resolves browser language preferences. The default preference is `auto`; a user-selected locale is saved locally and takes priority. Simplified and Traditional Chinese are distinguished using script/region variants; unsupported languages fall back to English. Browser language changes update the automatic setting; another tab's saved preference can also update the UI.

iPhone/iPad defaults to the Harness; desktop defaults to the project home with community and ESP32 setup pages. Platform routing and locale selection are independent: language must not hide capabilities or change device identities.

Translations live in `apps/web/locales/messages.js`. User-authored titles, model IDs, account labels, session content and downloaded Skill text retain their original content. Built-in Skill instructions may be written in English, but the authoring guidance explicitly asks the model to write new Skill content in the user's current language. Changing UI language does not silently rewrite saved sessions or community packages.

## Errors and dynamic state

Runtime and community errors should expose stable codes; the UI maps them to localized messages. Never localize protocol keys, tool names, HTTP field names, creator IDs, model IDs or wire enum values. Keep user-facing explanations separate from these identifiers. Failure, unverified capability, missing configuration and actual success must remain distinct in every language.

A translated button is not proof that the underlying capability passed acceptance. In particular, Codex device-code compatibility and encrypted account handling are implemented, but real Safari sign-in/CORS is not validated; the official community API is deployed; authenticated product firmware still needs physical Safari/LAN and phone-input acceptance.

## GitHub behavior

GitHub's repository description is a single field. It does **not** change automatically with the visitor's operating-system or browser language. Keep that field in English and use the eight-language navigation at the top of each README. These Markdown links do not imply automatic locale negotiation on GitHub.

The Web site has its own automatic locale selection and manual language menu. It is separate from GitHub's rendering and from the language of the linked engineering documentation.

## Maintenance and checks

- Update the English and Simplified Chinese descriptions first, then keep all seven translated READMEs aligned with the same implementation boundaries.
- Preserve commands and paths across translations; localize the surrounding explanation naturally.
- Check navigation and relative links from each translated file, not only from repository root.
- Test automatic selection, manual selection, reload persistence and unsupported-language fallback.
- Check mobile and desktop labels, dialogs, validation errors, async failures and empty states in all eight locales. A key's presence alone does not verify layout or translation quality.
- Do not claim complete browser acceptance from static translation coverage; UI interaction checks and physical-device checks are separate evidence.

This documentation update did not alter GitHub settings or deploy a website. The repository languages and current local source were checked; future UI changes still need their own localization verification.
