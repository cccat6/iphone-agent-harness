---
name: clock-and-time
description: Set and verify exact alarm, clock, date and time values using visible numeric editing or bounded picker adjustment.
version: 0.1.2
---

# clock-and-time

## Runtime contract

This is guidance for existing phone tools, not executable code or permission. Use only actually exposed tools for the verified iPhone/iPad. Coordinate integers 0..10000 refer to the **whole screenshot**, not the Harness viewport. Every gesture is complete and released. A HID receipt proves submission; verify the selected time and saved alarm in fresh screen evidence.

## Procedure

1. Understand the requested time, day, AM/PM or 24-hour format, recurrence and whether the user wants a new alarm or an existing one changed. Ask only when the request leaves a material choice unresolved; never guess AM/PM from a wheel position.
2. Use `phone-navigation`; load it only if its full instructions are missing from the current context. The same applies to `text-entry` and `gesture-correction`: request clearly needed missing Skills together, not once per adjustment. Use a fresh frame already returned by a plan, or observe if none is current, and open Clock/Alarms through reviewed transitions. Do not reuse Home icon coordinates from an earlier frame. Confirm the actual alarm editor before entering anything.
3. Read the visible selected hour, minute and meridiem. Choose the input method before starting wheel corrections. Prefer direct numeric editing **when the actual control supports it**: try one tap on the selected hour/minute and review for a caret, selected text or keyboard. If it remains a wheel, one deliberate double tap on that same visible number may reveal editing; review before typing. This is a capability probe, not a guarantee that every iOS/app picker supports editing.
4. Once focus is visibly established, use `text-entry`; enter all digits for that focused numeric field together in one bounded plan, then capture once. If a selection is visibly established, replace it; if the current text is not selected, verify the field before selecting or clearing it. Use only the required digits with verified HID mappings. Do not send select-all/delete until the focused field is known. For example standard keyboard digit usages are 30..38 for 1..9 and 39 for 0; keep each key released. Read the resulting value and focus. If both fields are visibly editable and their positions remain stable, a subsequent plan may focus the next known field and type its digits together; otherwise review the focus transition first. A keyboard operation may alter both fields or the active segment: read the actual UI before proceeding.
5. If a fresh review shows direct numeric editing is unavailable, use one short deliberate `drag` in the correct wheel column with an endpoint hold, then review the selected value. Measure the before/after selected values, drag direction and visible row spacing. For a distant value, use that observed response to choose a bounded larger held drag toward it; as the remaining error shrinks, reduce travel for the final correction. Avoid a one-row-per-model-turn loop when several rows remain. If the response is nonlinear or wraps unexpectedly, remeasure or switch input method; do not assume fixed pixels per minute, direction, wrapping, inertia, or wheel sensitivity. Use `swipe` only when release velocity is intentionally wanted, never for a final exact adjustment.
6. Set `settleMs` around 1200–2000 only for a wheel observed to settle slowly; reuse the measured wait for this control. For a drag plus settling plus review, allow for bridge completion, capture and saving within the available plan budget, normally up to 15000 ms when the runtime allows it. A 3500–4000 ms total plan leaves little room for those stages. Respect a shorter explicit user limit. After motion, take a small temporal image group if needed to distinguish settling from the final selection. Use actual frame metadata. A screenshot acquired immediately after HID submission may show animation rather than the settled value; compare a later frame before adjusting again.
7. Verify exact hour, minute, AM/PM, selected days and enable state **before** Save/Add. Submit the visible Save/Add control as a separate reviewed action. Confirm the matching alarm in the resulting list; merely closing the editor or receiving a HID receipt is insufficient.

## Bounded correction

An incorrect tap or a wrong wheel value is an observed mismatch, not grounds to abandon the entire task. Re-observe and change the approach (for example numeric editing instead of a long wheel drag). Load `gesture-correction` and retain measured response with `phone_remember_interaction`. Continue evidence-grounded corrections while progress is possible; a distant target calls for a measured larger move, while fine adjustments belong near the goal. Do not return to the same failed input method without new evidence; ask for help only for a real unresolved blocker or repeated unchanged failures, not after a fixed number of attempts. If input was submitted but its screenshot timed out, use a fresh observation or restore sharing first; do not repeat that input to retry its screenshot. Never replay an unknown-delivery Save/Add action: inspect the alarm list first to avoid duplicates. On sharing loss, pause until restored and obtain a fresh frame. User Stop always ends the run.

## Double-tap example

Only after locating a selected number in a fresh frame, two independent short taps at that same point (first tap `settleMs:0` so the default wait does not prevent a double tap) can probe editing, followed by review. Use actual coordinates and runtime IDs:

```json
[
  {"id":"number-first-tap","op":"tap","point":{"x":5000,"y":4200},"holdMs":60,"settleMs":0},
  {"id":"number-second-tap","op":"tap","point":{"x":5000,"y":4200},"holdMs":60},
  {"id":"number-focus-proof","op":"capture","frames":{"count":1,"intervalMs":0,"timeoutMs":5000},"review":true,"label":"time-number-editing"}
]
```

These coordinates are illustrative. Two segments may be delayed by the transport and not recognized as a double tap; if the screen does not enter editing, do not assume success or keep tapping. Prefer already-exposed text fields when available.
