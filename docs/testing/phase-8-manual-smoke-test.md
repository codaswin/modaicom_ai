# Phase 8 manual Chrome smoke test — Editor Insertion + Inline Trigger Redesign

**Status: Pending validation**

Record only date, browser / extension build, area, pass/fail, and a short
non-sensitive symptom. Never record API keys, LinkedIn content, or provider
responses.

| Date | Browser / extension build | Area | Result | Symptom |
|---|---|---|---|---|
| | | Trigger sits just left of the emoji button | Pending | |
| | | Trigger appearance + states (light) | Pending | |
| | | Trigger appearance + states (dark) | Pending | |
| | | Popup opens automatically on trigger click | Pending | |
| | | Insert into an empty `legacy` comment box | Pending | |
| | | Insert into an empty `sdui` comment box | Pending | |
| | | Insert into an empty `legacy` reply box | Pending | |
| | | LinkedIn Post button enables after Insert | Pending | |
| | | Ctrl-Z reverts the insertion | Pending | |
| | | Insert refuses on a non-empty box | Pending | |
| | | Re-trigger on another post, then Insert → refused | Pending | |
| | | Navigate away, then Insert → refused | Pending | |

## Setup

1. `npm run check`, load `dist/` unpacked. A provider must already be configured
   and consented (Phase 5) — so the popup shows the Response Controls and
   **Generate**.

## Trigger redesign

2. On a `legacy` post and an `sdui` feed post, the modaicom trigger sits in the
   comment box's action row **immediately to the left of the emoji button**, a
   small purple rounded-square showing the **m** mark — **not** the word
   "modaicom". It lines up with the emoji / GIF / photo icons.
3. Hover → it darkens and lifts slightly, and a "Generate with modaicom" tooltip
   appears. Tab to it → a visible focus ring. Press and hold → it depresses.
   Click → while it extracts, the mark becomes a spinner and it is not
   clickable again.
4. Switch LinkedIn to Dark mode (Me → Settings → Account preferences → Dark
   mode). The trigger still looks right — solid purple, legible mark, visible
   focus ring.
5. LinkedIn's own comment actions (Comment / emoji / photo) are still clearly
   distinguishable from the modaicom trigger.
6. Click the trigger → the modaicom **popup opens on its own** (no click on the
   toolbar icon needed), showing the extracted context. If your Chrome build
   doesn't allow programmatic popup open, the toolbar icon still works.

## Insertion — happy path

7. Click the trigger on a post whose comment box is **empty**, open the popup,
   pick any Tone/Intent/Length, **Generate**, then **Insert**.
   - The draft text appears in that exact comment box.
   - **LinkedIn's Post button becomes enabled.**
   - The cursor is in the comment box, at the end of the inserted text.
   - Press **Ctrl-Z** → the insertion is undone in one step.
   - The popup shows "Inserted into your LinkedIn comment box — review it and
     click LinkedIn's Post button…". modaicom does **not** offer to post.
8. Repeat 7 on an `sdui` feed post (TipTap editor) and on a `legacy` reply box.
9. With a draft shown, click **Regenerate**, then **Insert** again — the box now
   holds the new draft (the previous, untouched modaicom draft was replaced).
10. Double-click **Insert** quickly → the draft is inserted once, not twice.

## Insertion — refusals

11. Type a few words into the comment box yourself, then Generate → **Insert**.
    The popup says "Your comment box already has text. Clear it, or use Copy."
    Your words are untouched. **Copy** still works.
12. Click the trigger on post A, open the popup, Generate. Then in LinkedIn click
    the trigger on **post B**. Back in the popup (still showing A's draft), click
    **Insert** → "That comment box is no longer available. Click the modaicom
    button again…". Nothing is inserted anywhere.
13. Generate a draft, then navigate LinkedIn to a different page. **Insert** →
    "You've navigated away…". 
14. Generate a draft, switch the active browser tab away from LinkedIn, click
    **Insert** → "Switch to the LinkedIn tab where you started, then Insert."
15. On every refusal the draft stays visible with **Copy**.

## Privacy spot-check (dev)

16. DevTools on the **service worker**, Network tab: an **Insert** click produces
    **no** service-worker network request and no `chrome.storage` write. The
    draft text travels only popup → content script.
17. `chrome://extensions` → the extension's permissions are unchanged from
    Phase 7 (`activeTab`, `storage`, optional `api.openai.com`).

See [ADR-0011](../adr/0011-editor-insertion-and-inline-trigger-redesign.md) and
[the Phase 8 spec](../specs/phase-8-editor-insertion-inline-trigger-redesign.md).
