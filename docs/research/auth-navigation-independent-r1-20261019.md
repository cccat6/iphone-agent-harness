# Independent review: credentials, model options and navigation

Date: 2026-10-19

Scope: current working tree following the reported HTTP 401, missing reasoning controls, confusing session menus, and bridge/capture loss during navigation. Review was independent of implementation, using source inspection and deterministic tests; no API credentials, serial ports, phone input, deployment or CI were used by this reviewer.

## Findings and resolution

1. Restoring a panel on the current conversation originally called `openSession` again. This could reject while submission was active, or reset the pending stream and capture-pause flag. The implementation now restores the conversation view without reopening the same session. A regression invokes the actual navigation restoration function with an active submission, pending text and capture pause.
2. A slow historical session read could finish after a newer Back-to-list action. Navigation restoration now invalidates pending panel/session generations before awaiting work. An actual `openSession` regression confirms that the late read does not load history or reopen conversation.
3. Provider discovery preserved reasoning capabilities at the network layer, but the editor's model mapping omitted them. Both editor mapping and profile normalization now retain reasoning metadata. An actual editor-mapping regression checks nonstandard catalog levels (`low`, `ultra`), default effort and context window.
4. Deleted sessions can remain in browser history. History restoration now returns safely to the list instead of throwing a missing-session error.

## Validation

`tests/web/auth-navigation-independent-r1.test.mjs`: 6 passing cases:

- Settings → accounts → provider editor → save return → browser Back/Forward.
- Same-document website navigation and restoration of the original conversation.
- Current conversation panel restoration preserves pending text and capture pause.
- Late history reads cannot reopen conversation after returning to the list.
- A deleted-session history entry returns to the list.
- Editor-applied model catalogs retain exact reasoning capability metadata.

Also inspected and ran the credential-recovery, reasoning-effort and session-auto-title suites (24 cases at review time; all passed). They cover saved-key recovery after IndexedDB reopen, API/profile ownership despite stale subscription metadata, pre-network missing/locked-key errors, separate HTTP authentication/billing errors, protocol-specific effort payloads, bounded title generation and manual-rename races.

No new blocking issue remained in this inspected scope after these fixes. This review does not establish that the specific phone's 401 is resolved: its local browser records were not read. It also does not claim that a full document unload can preserve a screen-capture stream. The persistence checks concern application navigation within the same document; physical phone recording and RTC acceptance remain separate.
