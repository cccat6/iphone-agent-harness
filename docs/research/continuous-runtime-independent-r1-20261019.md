# Continuous phone execution and manual history review — independent pass 1

Date: 2026-10-19. Scope: current uncommitted changes after `7cbd19c`.

## Findings

1. **Fixed by parent:** automatic older-message paging still required `!state.running`, preventing the user from reading beyond the resident history window during long tasks. The parent removed that condition; bounded history paging, generation checks and visual anchors remain responsible for safe loading.
2. An earlier follow-scrolling regression test expected a bare programmatic scroll after wheel-up to resume following. The new behavior intentionally requires user movement toward the bottom or the explicit latest button. The parent was notified to update the test rather than restore forced following.

No additional production defect found in the examined continuous runtime and settle timing.

## Independently exercised behavior

`node --test tests/web/continuous-runtime-independent-r1.test.mjs` — 4 passed:

- 26 successful phone plan executor calls in one run, followed by a fresh screenshot and evidence-based completion. The former default round/tool budgets do not interrupt this sequence.
- An uncertain physical sequence is durably fenced across runs and is not resent under a new plan ID.
- User Stop cancels a model request that never resolves and releases the run writer.
- A deliberately zero-settle first tap remains immediate; the next tap's explicit settle delays screenshot collection after the HID release receipt.

Reviewed: recurring ownership renewal, bounded recent frame/call caches with durable indexes, exact-operation no-progress detection, capture-stop pause paths, cumulative per-plan settle preflight, component-scoped correction notes, and gesture-correction instructions.

## Boundaries

These tests use in-memory storage and deterministic adapters. They send no phone input, contact no model API, flash no firmware and do not establish actual iPhone pointer precision, wheel physics or Safari background longevity. Request/segment limits remain bounded; an overall task budget is absent by default. Repeated unchanged failure or missing prerequisites can still require user intervention.

## Session-row gesture follow-up

Reviewed the subsequently added `session-swipe.js` and the root `renderSessions` / `sessionRowAction` integration. Normal rows expose rename/archive; archived rows expose rename/restore/delete; deletion is limited to archived sessions and still requires explicit confirmation. No mutation occurs solely from swipe distance.

`node --test tests/web/session-swipe-independent-r1.test.mjs tests/web/continuous-runtime-independent-r1.test.mjs` — 7 passed in total. Additional independent gesture fixtures cover:

- Vertical list scrolling and left-edge browser navigation do not reveal row actions or mutate.
- Horizontal reveal suppresses the synthetic click that would accidentally open the session; opening another row closes the first.
- The restore action dispatches the exact archived row identity and closes the action tray.

No new blocking finding from this gesture pass. These are event-routing fixtures, not a physical iPhone gesture-feel acceptance.
