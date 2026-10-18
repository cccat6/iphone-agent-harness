# Final UI and session review R9 — 2026-10-19

Outcome: no new actionable issue found within this review's scope. This is an independent source and host-test review, not iPhone physical acceptance. No implementation was changed, no serial port was accessed, and no browser or deployment operation was performed.

## Scope reviewed

- Production `app.js` session opening, history paging, scroll anchoring, long-message text paging, session-list paging, run completion, and deletion/clear paths.
- `core/history-window.js`, `ui/history-images.js`, `core/store.js`, and `core/session-files.js`: bounded history windows, stale asynchronous results, image lifetime, incremental backup restore, and export.
- `ui/viewport.js` and final responsive CSS: phone landscape, zoom/pan measurements, editable-focus keyboard handling, visible viewport offsets, compact mode, and reduced-height panels/composer.
- Native Shortcut generated branch graph and firmware pending-clipboard route: a request without pending text returns an empty result and must not copy or acknowledge a job.
- MCU settings/setup language selection, `/settings?lang=…` routing, renamed-device links, and public RTC import metadata.

## Verification performed

1. Eight relevant web test files passed: **55/55**, recorded in `build/final-ui-review-r9-tests.log`. Coverage includes delayed reads after session switches, bounded paging in both directions, indexed history reads, database reconnection/rollback, incremental file parsing and export, clipboard session/target matching, and viewport rotation/zoom/keyboard transitions.
2. Generated Shortcut graph tests passed: **4/4** (`python3 tests/firmware/clipboard_shortcut_test.py`). Both launch paths exit without Copy or POST for empty text/empty job responses; real jobs copy before acknowledgment.
3. `sh tests/firmware/run_html_render.sh` passed. This compiles the actual MCU HTML renderers and executes their scripts. Eight language DOMs, explicit language override, system-language fallback, unknown-language English fallback, settings restart links, stale credential recovery, and parsed public RTC return links passed.
4. Additional independent in-memory checks passed: twelve simultaneously visible image nodes load at most eight images; releasing two image nodes makes room for two pending images; destruction revokes every created URL and removes all image sources. Clearing the history during a pending load discards the late result and does not resurrect the previous session.

An initial attempt to run the MCU settings script as a standalone Node test omitted its required rendered-HTML argument. The proper HTML-render harness above was then run successfully; that invocation error was not a product defect.

## Conclusions and verification limits

- Session/history generation checks prevent old asynchronous results from replacing another selected or cleared session. Long text display, history rows, and visible image URLs have bounded working sets. UI history loading does not hydrate the full conversation's images.
- File import reads slices and validates before creating a visible restored session. Export reads one message at a time and hydrates one image at a time. The already documented legacy single-record allocation limit remains; this review did not add an incompatible old-backup rejection rule or claim zero memory allocation for an individual legacy record.
- Viewport measurements use visual-viewport CSS pixels and preserve offsets during zoom/pan. Keyboard-specific presentation requires editable focus and an unzoomed-height deficit; pinch zoom alone is not classified as a keyboard. Actual iPhone keyboard/orientation acceptance remains separate from these host checks.
- Empty pending-clipboard responses precede stale source checks; Shortcut branches leave the existing clipboard unchanged and send no acknowledgment in this case. Actual iPhone Shortcut permission and execution remain a physical acceptance item.
- The short MCU pages choose an explicit supported `lang` parameter first, then a supported system language, then English. The root HTTP handler removes the query before matching `/settings`, and hostname-change links retain the selected language. The return-to-Harness fragment contains public board/RTC metadata and no manager token.

No new fix was requested by R9. Full device behavior, firmware deployment identity, and physical input acceptance are owned by the main session's separate evidence.
