# Phase 8 — Editor Insertion + Inline Trigger Redesign

Status: Specified on 2026-08-31 (grill-with-docs → to-spec). Builds on ADR-0001,
ADR-0002, ADR-0003, ADR-0004, ADR-0010, and is recorded in ADR-0011.

## Problem Statement

Two problems, one phase.

**1. The draft is a dead end.** modaicom produces a good comment draft in the
popup, and then the user has to select it, copy it, switch to the LinkedIn tab,
click into the exact comment box, and paste. Every generation ends in clerical
work. The whole point of targeting *that* composer is lost at the last step.

**2. The inline trigger looks unfinished.** It is a bare `<button>` with the
literal text "modaicom", no stylesheet at all, dropped into the comment area as
a normal-flow element that pushes LinkedIn's layout around. It reads as a bug,
not a feature, and it inherits whatever LinkedIn's global CSS does to buttons.

## Solution

**Insertion.** The popup's draft panel gains an **Insert** button next to Copy
and Regenerate. Clicking it writes the draft, unchanged, into the exact comment
or reply composer that started the Inline Targeting Session — through the
browser's real editing pipeline, so LinkedIn's editor registers it and its Post
button enables. The user reviews it in place and clicks LinkedIn's own
Post/Reply control. **modaicom never submits** (ADR-0001, reaffirmed).

If the exact editor is gone, the page has navigated, the session was superseded
by a later trigger click, or the box already holds text the user wrote, Insert
**refuses** with fixed, actionable copy and leaves Copy available. It never
guesses at a different box and never overwrites a person's words.

**Trigger redesign.** The trigger is rebuilt inside a **shadow root**, styled
from one bundled stylesheet — a compact 28px brand-purple squircle showing the
modaicom **m** mark, with hover / focus / pressed / disabled / loading states
and an accessible label. It is anchored as a zero-size in-flow element with an
absolutely-positioned button, so it tracks the editor without shifting
LinkedIn's layout and without any position-syncing code. LinkedIn's CSS cannot
reach it; its own filled background makes it theme-independent and unmistakably
not a LinkedIn-native action.

## User Stories

### Insertion — the happy path

1. As a user, once I like a draft, I want to put it into my LinkedIn comment box
   with one click, so that I don't have to copy, switch tabs, and paste.
2. As a user, I want the draft inserted into the **exact** box I clicked the
   modaicom button next to, so that it never lands in the wrong conversation.
3. As a user replying to a comment, I want Insert to target that reply composer,
   so that the behaviour matches a top-level comment.
4. As a user, I want LinkedIn's Post button to become enabled after Insert, so
   that I can actually post the draft I inserted.
5. As a user, I want the cursor left in the comment box after Insert, so that I
   can immediately tweak the wording.
6. As a user, I want to be able to Ctrl-Z the insertion, so that an unwanted
   insert is one keystroke to undo.
7. As a user, I want to Regenerate and Insert again into the same box without
   re-clicking the modaicom button, so that I can iterate on the draft.
8. As a user, after Insert I want the popup to tell me to review it and click
   LinkedIn's Post button, so that I know modaicom is done and the next step is
   mine.

### Insertion — safety and refusal

9. As a user who already typed something in the comment box, I want Insert to
   refuse and tell me, rather than overwrite my words or mangle them together
   with the draft.
10. As a user, I want "already has text" to still let me use Copy, so that I have
    a way forward.
11. As a user, if modaicom already inserted a draft I haven't touched and I
    Regenerate, I want the new draft to replace the old one cleanly.
12. As a user, if I edited modaicom's inserted draft and then Regenerate + Insert,
    I want it to refuse — my edits are my words now.
13. As a user who scrolled the post out of view or whose feed reshuffled, I want
    Insert to refuse with "click the modaicom button again", not insert into some
    other post's box.
14. As a user who navigated to another page, I want Insert to refuse and tell me
    I've navigated away.
15. As a user who clicked the modaicom button on a second post while the popup
    was still open showing the first draft, I want Insert to refuse — the draft
    and the target no longer match.
16. As a user whose active tab isn't the LinkedIn page anymore, I want Insert to
    tell me to switch back to that tab.
17. As a user, if insertion just fails for a technical reason, I want a clear
    message and Copy still available, not a silent nothing or a crash.
18. As an impatient user, I want a double-click on Insert to do one insertion,
    not two.
19. As a user, I never want modaicom to click Post, Reply, like, or anything
    else on my behalf.

### Trigger redesign

20. As a user, I want the modaicom button beside the comment box to look like a
    finished, polished control, so that I trust the extension.
21. As a user, I want it to show the modaicom mark, not the word "modaicom", so
    that it's compact and recognisable.
22. As a user, I want it to be obviously a modaicom control and not be confused
    with LinkedIn's own comment actions.
23. As a user, I want it to not push LinkedIn's layout around when it appears.
24. As a user, I want clear hover, focus, pressed, disabled and loading feedback,
    so that I know what it's doing.
25. As a keyboard user, I want to Tab to it and press Enter/Space, and see a
    clear focus ring.
26. As a screen-reader user, I want it announced as "Generate a comment/reply
    with modaicom", so that I know what it does.
27. As a user hovering it, I want a "Generate with modaicom" tooltip.
28. As a user with LinkedIn in dark mode, I want the button to still look right.
29. As a user, I want it to keep looking right even after LinkedIn changes its
    own styling.

### Maintainer

30. As a maintainer, I want all trigger styles in one stylesheet, not scattered
    as inline styles through DOM-building code.
31. As a maintainer, I want LinkedIn's CSS unable to affect the trigger and the
    trigger's CSS unable to affect LinkedIn, so that neither surprises the other.
32. As a maintainer, I want the DOM-write code in its own module, with the read
    adapters staying strictly read-only.
33. As a maintainer, I want the insert command to never pass through the service
    worker and the draft text to never be logged or persisted.
34. As a maintainer, I want the exact-editor / session-match / route checks to be
    the single authority on whether an insert is allowed, not spread across the
    popup.
35. As a maintainer, I want no new manifest permission, host, or
    `web_accessible_resources` entry.
36. As a maintainer, I want deterministic tests for the orchestration, refusal
    paths, message guard, and trigger rendering, and a manual smoke test for the
    part only a real LinkedIn editor can prove.

## Implementation Decisions

### One draft, unchanged

Phase 7's single Generated Draft is unchanged. "Choosing a suggestion" is the
deliberate **Insert** click versus Copy / Regenerate / closing the popup. No
multi-candidate generation, no picker, no change to the provider contract or the
generation protocol.

### Re-finding the exact editor: live reference, exact-or-refuse

At Inline Trigger click the content script stashes, in module scope, a **live
reference to the exact editor node**, together with the session's `sessionId`,
`generation`, and `location.href`. There is no re-resolution by key or heuristic
at insert time — the feed virtualises and recycles nodes, and a re-resolved
match could be a different post's box.

Insert proceeds only if **all** hold:

- the `INSERT_DRAFT` message's `sessionId` **and** `generation` equal the live
  session's (a fresh trigger click or a page reload invalidates the pair);
- `location.href` is unchanged since the click;
- the stashed node is still `isConnected` and still classifies as the same
  composer kind (`post-comment` / `comment-reply`).

Otherwise the content script replies `{ ok: false, reason }`.

### Inline Targeting Session lifetime

Extended from "ends at extraction handoff" to "ends at SPA route change, a fresh
trigger click anywhere, or the 5-minute relay TTL". It now spans extraction,
generation, and any number of insertions. A successful insert does **not** end
it. The stashed editor reference is cleared on exactly those three events.

### Non-empty editor: refuse, with one exception

Insert refuses (`editor-not-empty`) whenever the editor contains text. "Empty" is
structural: no text after trimming, ignoring a lone `<br>`, an empty `<p>`, and
LinkedIn's own placeholder text/attribute.

**Exception:** the content script records the exact string it last inserted into
that editor this session. If the editor's current text is byte-identical to that
string (user hasn't touched it), a re-insert may replace it. Any difference →
treat as user work → refuse.

modaicom never appends, prepends, or prompts-to-replace. Copy stays offered on
refusal.

### Insertion technique

- **contenteditable:** focus the editor; for the replace-own-insertion case
  select-all first; then `document.execCommand('insertText', false, draft)`.
- **textarea:** native value-setter (`HTMLTextAreaElement.prototype` descriptor)
  + a bubbling `input` event.
- **Verify by readback:** if `execCommand` returns `false` or the editor's text
  does not then contain the draft → `{ ok: false, reason: 'insert-failed' }`. No
  fallback to raw DOM mutation.
- After success: focus stays in the editor, caret at the end of the inserted
  text. Nothing scrolled or clicked.

`execCommand` is deprecated but is the only in-Chrome method that routes through
the editing pipeline so Quill (`legacy`) and TipTap/ProseMirror (`sdui`) accept
it and the user can Ctrl-Z. A future editor that rejects it fails closed
(`insert-failed`) and triggers an adapter-version bump — the read-adapter
discipline.

### Transport

New additive message in `shared/protocol.ts`, carried at `RELAY_VERSION` with
**no bump**:

```
INSERT_DRAFT { version: RELAY_VERSION, type: 'INSERT_DRAFT',
               text: string, sessionId: string, generation: number }
```

Sent by the popup with `chrome.tabs.sendMessage` to the active tab's content
script (the ADR-0004 `REQUEST_PAGE_EXTRACTION` pattern). Reply:
`{ ok: true } | { ok: false; reason: InsertFailureKind }`.

The relay read (`GET_LATEST_RELAY`) is widened to return `{ result, sessionId,
generation }` instead of bare `result`, so the popup can echo the pair. The
`SessionRelayRecord` already stores `generation`; it gains `sessionId`.

The **service worker never handles `INSERT_DRAFT`** and never sees the draft
text. The content script's diagnostics never record the draft text (ADR-0008).

### Failure taxonomy

`InsertFailureKind` = `editor-unavailable` | `route-changed` | `editor-not-empty`
| `insert-failed` (content side) | `wrong-tab` (popup side — a
`chrome.tabs.sendMessage` rejection). Each maps to a fixed, selector-free string
in a popup `insertErrorMessages` map, mirroring `generationErrorMessages` /
`contextMessages`. Every failure path keeps the draft panel and Copy visible.

### Popup surface

`DraftView` gains an **Insert** button (primary), with Copy and Regenerate
retained. Insert disables itself while a request is in flight (the Inline
Trigger's `button.disabled` pattern). On `{ ok: true }` the panel shows a
terminal confirmation directing the user to LinkedIn's Post button — modaicom
does not offer to press it. Regenerate remains available afterwards; a
post-Regenerate primary action reads "Replace with new draft". A small
`useInsert` hook wraps the one-shot `chrome.tabs.sendMessage` (not a Port —
unlike `useGeneration`).

### Modules

- **`src/content/insertDraft.ts`** — new. DOM-write only: `(editor, text, mode)
  → typed result`. Contains an internal `writeIntoEditor(editor, text): boolean`
  seam (real `execCommand` / native-setter in production, stubbed in tests).
- **`src/content/triggerButton.ts`** — new. Builds the shadow host + `<button>` +
  attaches the stylesheet; exposes busy/disabled state setters.
- **`src/content/inlineTrigger.css`** — new. The single stylesheet, imported as a
  string, applied via `adoptedStyleSheets`.
- **`src/content/inlineTrigger.ts`** — gains the stashed session/editor state,
  the `INSERT_DRAFT` handler, the own-insertion string tracking; delegates
  trigger construction to `triggerButton.ts`.
- **`src/shared/protocol.ts`** — `INSERT_DRAFT` type, `isInsertDraftMessage`
  guard, `InsertFailureKind`, the reply union; `GetLatestRelay` reply widened.
- **`src/shared/relay.ts`** — `SessionRelayRecord` gains `sessionId`; guard
  updated.
- **`src/background/serviceWorker.ts`** — the relay read returns `{ result,
  sessionId, generation }`.
- **`src/popup/useInsert.ts`** — new.
- **`src/popup/Popup.tsx`** — `DraftView` Insert button + states;
  `insertErrorMessages`.

The read adapters (`postAdapter`, `commentAdapter`, `composerAdapter`) are not
touched — insertion is a separate concern.

### Trigger: styling and anchoring

- **Shadow DOM** on the wrapper host; styles from `inlineTrigger.css` via
  `adoptedStyleSheets`. No inline `style=` in DOM code. Full isolation both ways.
- **Anchoring:** host is `position: relative; width: 0; height: 0; overflow:
  visible`, inserted after the editor as today. The `<button>` is `position:
  absolute`, offset just past the composer's right edge (exact offsets tuned in
  smoke testing). No `ResizeObserver`, no scroll handlers.
- **Theme-independent:** solid `#5b3fd6` 28px squircle, white `m` mark (bold
  system font, as the popup's `.popup__brand-mark`), its own background. No
  LinkedIn-theme detection. An optional `@media (prefers-color-scheme: dark)`
  block adjusts only shadow/ring.
- **States:** hover (darken `#4930b7`, 1px lift), focus-visible (3px `#b9aaff`
  ring, 2px offset), pressed (`scale(.96)`), disabled (`opacity .5`,
  `cursor: not-allowed`), loading (mark → CSS spinner, `aria-busy="true"`,
  non-interactive) during extraction.
- **Label:** `aria-label` = "Generate a comment with modaicom" / "Generate a
  reply with modaicom". Custom shadow-DOM tooltip (`aria-hidden`) = "Generate
  with modaicom". No `title`.
- **Reconcile/orphan-cleanup** machinery unchanged — still keyed by owner key,
  still adds/removes the host.

### No manifest change

Same hosts, same `permissions` (`activeTab`, `storage`), same
`optional_host_permissions`. No `web_accessible_resources`. No `tabs`/`scripting`
addition.

## Testing Decisions

A good test asserts observable behaviour at a module's public surface — what a
caller passes and what comes back, what the content script replies, what the
popup renders — never a private helper or call order. The actual browser editing
primitive (`execCommand`) is unavailable in jsdom (confirmed), so it sits behind
the `writeIntoEditor` seam and everything around it is tested deterministically;
the primitive itself is proven in the manual smoke test — mirroring Phase 7
("tests prove the instruction is in the prompt; the smoke test proves the model
obeys").

### Seams (prefer existing, highest possible, fewest)

- **`insertDraft.ts` — new seam, the `writeIntoEditor` boundary.** The single new
  seam. Tests stub it and exercise: empty-detection (`<br>`, empty `<p>`,
  whitespace, placeholder, real text); own-untouched-insertion replace-vs-refuse;
  orchestration (empty check → mode → write → readback-verify → typed result);
  readback mismatch → `insert-failed`. Prior art: the pure-function tests in
  `features/generation/generation.test.ts`.
- **`inlineTrigger.ts` — existing test module (`inlineTrigger.test.ts`).** The
  `INSERT_DRAFT` path: `sessionId`/`generation` mismatch → `editor-unavailable`;
  detached stashed editor → `editor-unavailable`; `location.href` changed →
  `route-changed`; idempotent no-op when content already equals the draft;
  non-extension sender ignored. Migrate existing assertions from
  `wrapper.querySelector('button')` to `wrapper.shadowRoot.querySelector(...)`
  and to the new `aria-label` strings. Prior art: the existing sender-auth and
  reconcile tests in the same file.
- **`triggerButton.ts` — new test module.** Shadow root built; `<button>`
  present; `aria-label` per kind; `aria-busy` toggles; tooltip node present;
  stylesheet adopted. jsdom 30 supports shadow DOM + `adoptedStyleSheets`
  (confirmed).
- **`protocol.ts` — existing test module (`protocol.test.ts`).**
  `isInsertDraftMessage` accept/reject table. Prior art: the existing
  `isGenerationPortMessage` / `isRelayMessage` tables.
- **`relay.ts` — existing test module.** `SessionRelayRecord` guard accepts the
  record with `sessionId`, rejects without.
- **`background/serviceWorker.ts` — existing test module.** The relay read
  returns `{ result, sessionId, generation }`.
- **`Popup.tsx` — existing test module (`Popup.test.tsx`).** Insert appears on
  `done`; click → `chrome.tabs.sendMessage({ type: 'INSERT_DRAFT', text,
  sessionId, generation })`; `{ ok: true }` → confirmation copy; each `reason` →
  its fixed copy; Insert disabled in-flight; draft + Copy survive every failure.
  Prior art: the existing generation-state and error-copy tests in the file.

### Smoke test only (`docs/testing/phase-8-manual-smoke-test.md`, new)

`execCommand('insertText')` actually populating Quill (`legacy`) and
TipTap (`sdui`) and enabling LinkedIn's Post button; caret/focus landing;
Ctrl-Z undo; re-trigger-on-another-post then Insert → refused; non-empty refuse;
trigger visual states on real light **and** dark LinkedIn; zero layout shift on
trigger appearance; the exact right-edge offset.

## Out of Scope

- Automatic Post / Reply / submit of any kind (ADR-0001).
- Auto-engagement (liking, following, reacting).
- Multiple or ranked drafts / a candidate picker (ADR-0010).
- A page-side Insert affordance — Insert lives in the popup, where the draft is.
- `chrome.action.openPopup()` or any attempt to fuse "click trigger" and "open
  popup" into one gesture.
- New AI providers, local AI, analytics.
- Any options-page / settings work.
- Appending to or merging with the user's existing editor text.
- Reading the editor's existing contents for any purpose other than the
  empty / own-untouched-insertion check.

## Further Notes

- **ADR-0011** records this phase, including the deliberate partial reversal of
  the "editor is never mutated / focused" clause of ADR-0002, ADR-0003, and the
  Phase 3 spec, and the reaffirmation of ADR-0001.
- CONTEXT.md gains **Draft Insertion** and **Insertion Failure**, and revises
  **Inline Trigger**, **Inline Targeting Session**, and **Generated Draft**.
- The two-click flow (click trigger on the page, then click the toolbar icon to
  open the popup) is unchanged and acknowledged as friction; fusing it is out of
  scope.
- The phase is not complete until a dated manual Chrome smoke test passes on both
  the `legacy` and `sdui` surfaces, for both a comment composer and a reply
  composer.
