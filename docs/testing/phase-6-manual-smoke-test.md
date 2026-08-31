# Phase 6 manual Chrome smoke test — Response Controls (Tone, Intent, Length)

**Status: Pending validation**

Record only date, browser / extension build, area, pass/fail, and a short
non-sensitive symptom. Never record API keys, LinkedIn content, or provider
responses. Tone / Intent / Length ids are not sensitive but there is no reason to
log them.

| Date | Browser / extension build | Area | Result | Symptom |
|---|---|---|---|---|
| | | Controls render above Generate, grouped + labelled | Pending | |
| | | Default selection (Professional / Add insight / Medium) | Pending | |
| | | Change one control — other two unchanged | Pending | |
| | | Selection persists across popup close/reopen | Pending | |
| | | Keyboard: Tab to each control, arrow-key to change | Pending | |
| | | Length caption present, no word counts | Pending | |

## Setup

1. `npm run check`, load `dist/` unpacked. A provider must already be configured
   and consented (Phase 5) so the generation panel is reachable.
2. On a `legacy` LinkedIn post, click the `modaicom` trigger beside the comment
   composer and open the popup.

## Controls

3. The **Response controls** group appears above **Generate reply**, with three
   labelled dropdowns: Tone, Intent, Length. On first use they read
   **Professional**, **Add insight**, **Medium**.
4. Change Tone to **Confident**. Intent and Length must not move.
5. A single caption under Length reads "Short = a quick reply · Medium = a
   substantive comment · Long = a developed point" — no word counts, no
   per-option numbers. One hint line notes the controls guide the draft and you
   can still edit it.

## Persistence

6. Set Tone **Friendly**, Intent **Disagree**, Length **Long**. Close the popup.
7. Reopen it (same post) → the three controls still read Friendly / Disagree /
   Long.
8. (Optional, dev) `chrome://extensions` → service worker → Application →
   Storage → Local: key `modaicom.generation.preferences` holds exactly
   `{ tone, intent, length }` id strings — nothing else.

## Accessibility

9. With the popup focused, Tab reaches each dropdown in order; each announces its
   label and current value. Arrow keys / type-ahead change the value. A visible
   focus ring shows on the focused control.
10. The selected option is conveyed as text in the closed control, not by colour
    alone.

## Boundary spot-check (dev)

11. Phase 6 does **not** send Tone / Intent / Length anywhere. With DevTools on
    the service worker, a generation still shows the Phase 5 request shape only —
    no `tone` / `intent` / `length` field on any message or request. (Wiring the
    instructions into generation is Phase 7.)

See [ADR-0009](../adr/0009-response-controls-tone-intent-length.md).
