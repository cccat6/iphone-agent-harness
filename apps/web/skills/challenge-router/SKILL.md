---
name: challenge-router
description: Classify a visible verification challenge and select a compatible, versioned family skill during the user's phone task.
---

This is a design template, not a tested solver.

1. Obtain a fresh image from the active phone target. Identify whether the visible item is a checkbox, text, image selection, slider, rotation/order, or temporal challenge. An account password or one-time code prompt is not automatically a visual challenge.
2. Read the available family skill metadata. Load the exact compatible version. If there is no compatible skill, return unsupported with the missing capability instead of inventing a tool.
3. Let the family skill propose a bounded plan from the image. Use multiple predictable operations when appropriate; use a review boundary whenever content may rearrange or refresh.
4. Execute through the same phone plan validator and target authorization as all other operations. Preserve real motion timestamps for slider or temporal tasks.
5. Obtain fresh evidence of acceptance. A submitted click, completed drag, spinner, or transport acknowledgement alone does not prove solved.
6. On change, discard old target coordinates and classify again. On failure, stay within the current attempt/time budget. Return solved, failed, changed, insufficient_evidence, unsupported, or needs_user with references.

Do not store account secrets in this skill. Do not make additional network calls or install executable code through a recipe.
