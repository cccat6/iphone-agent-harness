---
name: gesture-correction
description: Learn from observed pointer misses, scrolling overshoot and picker response, then refine gestures or use direct entry.
version: 0.1.0
---

# Gesture correction

This is guidance for the existing fixed phone tools, not executable code or an input permission. Use only the current verified target, frame identity, orientation epoch and declared capabilities. Coordinates are 0..10000 across the complete screenshot, not Safari CSS pixels. A HID receipt confirms submission and release, not that the intended UI changed.

## Observe, predict, measure, correct

1. Before acting, locate a safe interior target or scrollable component from a fresh full-display frame. Read the runtime interaction notes for this same target and orientation. State the expected visible effect, not a hidden implementation assumption.
2. Start conservatively. For precise list/picker adjustment prefer a short `drag` with a modest endpoint hold, so release happens after slowing/stopping. Reserve `swipe` for desired inertia; release velocity and path length affect travel. Keep the entire path away from screen edges, editor dismissal handles, Cancel/Save buttons and neighbouring wheel columns.
3. After confirmed release use a component-appropriate `settleMs`. Defaults are tap 250, key 150, Home 450, drag/pointer 350, swipe 700 ms. A picker may need 1200–2000 ms or more; the supported override is 0..3000 ms. Request a small later frame group if values still move. Use actual timestamps/content; neither JPEG ready time nor a sleep proves a fresh or stable screen.
4. Compare the actual screen with the expected effect. Identify a persistent anchor or selected value. For scrolling, estimate content displacement relative to the gesture length/time, direction and release style. After overshoot reduce distance and velocity, use a held endpoint and reassess. After a miss re-localize the actual target from the new screenshot; do not apply a guessed universal x/y offset.
5. Preserve useful observed findings with `phone_remember_interaction({component,finding,evidenceFrameIds})`. Record the app/control, concrete parameter change, actual response and next improvement. Examples: “minute wheel moved 8 values with a short held drag; final correction should use a smaller drag, not another inertial swipe” or “single tap exposed a keyboard; use digits instead of wheel”. Include real frame IDs from this run. The tool replaces the component note rather than growing an unlimited transcript, and scopes it to this target/orientation. Evidence from one control is not a global calibration.
6. Continue gradually while each attempt yields useful evidence or progress. There is no fixed two-correction/step budget. Change the approach after repeated mismatch. When the same action still fails with unchanged evidence, an external prerequisite is missing, or delivery remains unknown, explain the real blocker and ask for the specific help needed. Never replay an uncertain Save/Add/Delete sequence under a new ID. User Stop always stops; sharing loss pauses.

## Choose the component's actual input method

- Ordinary buttons: short tap at the visible interior, wait, verify destination. If a wrong app opened, return through a reviewed transition and re-observe before the next attempt.
- Editable text/numbers: establish focus and inspect the caret/keyboard before typing. Use `text-entry`. Do not select-all/delete blindly.
- Time/date wheel: use `clock-and-time`. A tap, or a reviewed double-tap probe, may expose direct digit entry. Double taps use `settleMs:0` for the first tap and a normal wait for the second. Network-separated taps are not guaranteed to form a native double tap; inspect the UI before typing. If editing is unsupported, measure small held drags one column at a time, including wrap direction, then verify exact selected values before Save.
- Slider: locate track/thumb and move inside the track with a held drag; compare displayed value. Do not substitute inertial list scrolling.
- Scrolling list: use content anchors, progressively smaller travel near the target, and two later frames if inertia is unclear. Recompute coordinates after each visible motion.
- Drag and drop: use `drag-and-drop`; distinguish pickup/long-press, movement, final hold and release. A dismissal or edge gesture is an unintended navigation: re-observe and restore the intended view before any dependent input.

Do not write device offsets or sensitivity settings based on these notes. They are evidence-grounded planning guidance, not measured hardware calibration constants. Do not store unrelated private content in a shared Skill.
