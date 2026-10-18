# Clipboard text entry — 2026-10-18

Safari's Async Clipboard API requires a user gesture for writes. The Clipboard API specification also requires a focused document. Active screen sharing and background timer/recording callbacks do not grant either condition.

Sources reviewed:

- [WebKit: Async Clipboard API](https://webkit.org/blog/10855/async-clipboard-api/) — writes outside a click/touch gesture reject; secure context required.
- [W3C Clipboard API and events](https://www.w3.org/TR/clipboard-apis/) — asynchronous clipboard access requires document focus.

## Implemented contract

`core/clipboard.js` queues up to 20,000 UTF-16 code units of text with session and target identity. `prepare()` is synchronous and returns `awaiting_user_action` metadata, leaving no unresolved model request. It does not read or write the system clipboard. Text lives in the in-memory pending queue and the normal tool-call history; controller state and receipts do not duplicate it into diagnostic logs.

The user opens the Harness and presses **Copy text**. The click handler invokes `navigator.clipboard.writeText()` before any asynchronous boundary. The controller checks HTTPS API availability, document visibility/focus, user activation when exposed by the browser, and the current session/target binding. Browser refusal stays a failed copy; there is no `execCommand` fallback.

Only completion of the browser's write promise creates a `copied` receipt. Cancellation or target/session changes invalidate late completion. An in-flight write cannot be cancelled in the operating system; a cancelled request therefore cannot issue a valid receipt, and a second write is prevented until the first settles.

Copy itself does **not** issue HID input. The production **Copy and continue** button explicitly requests a new task after a successful copy; that task must observe the screen, navigate back to the intended app, confirm field focus and then submit the usual Cmd+V HID key action. Copy-only views do not continue automatically. The receipt identifies a past successful copy, not proof that no other app changed the clipboard afterward. Visible paste and final text still require screenshot verification.

`ui/clipboard.js` renders a localized eight-language card with a read-only text preview, Copy and Cancel. It writes text through DOM text properties, not HTML.

## Validation scope

Fifteen controller, UI and localization tests cover Unicode queuing, synchronous API invocation, background/focus/gesture rejection, browser failure, retry, cancellation races, target changes, bounds, eight locale key sets and continuation-save failure recovery. A failed save/continuation exposes an explicit retry that reuses the same copied receipt without writing the clipboard again; replaced or cleared requests cannot revive an old retry. These use a stubbed clipboard and do not replace the real computer's clipboard or send any phone input. Safari phone copy plus HID paste remains a physical acceptance task.
