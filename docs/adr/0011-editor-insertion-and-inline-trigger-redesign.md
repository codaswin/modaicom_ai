# Editor insertion, and the inline-trigger redesign

Status: accepted on 2026-08-31 (grill-with-docs). Builds on ADR-0001, ADR-0002,
ADR-0003, ADR-0004, ADR-0010.

Phase 8 does two things at once, recorded here as one decision because they ship
together and touch the same code: (1) modaicom may now **write a Generated Draft
into the LinkedIn comment/reply editor** the user targeted, and (2) the inline
trigger is rebuilt as an isolated, styled control.

## 1. Editor insertion

### The reversal, and what does not change

ADR-0002, ADR-0003, and the Phase 3 spec all state that the editor "is never
focused, blurred, read, mutated, wrapped, replaced, or used as extraction
input." Phase 8 **deliberately lifts the "mutated / focused" half of that** for
one narrow, user-initiated action: inserting modaicom's own draft text. The rest
stands — the editor is still never *read* as input, and its existing contents
are never used for anything.

**ADR-0001 is reaffirmed, not weakened.** modaicom inserts; it never submits.
The user still clicks LinkedIn's own Post/Reply control. There is no code path
that activates it.

### Exact editor, or refuse — never re-resolve

At trigger-click the content script stashes a **live reference** to the exact
editor node, plus the session's `sessionId` and `generation` and the current
`location.href`. At insert time it inserts only if **all** hold:

- the message's `{ sessionId, generation }` equal the live session's (binds the
  draft to the session that produced it — a second trigger click elsewhere, or a
  page reload, invalidates it);
- `location.href` is unchanged since the click;
- the stashed node is still `isConnected` and still classifies as the same
  composer kind.

Otherwise it **refuses** with a typed reason. It never re-resolves the editor by
key or heuristic: the LinkedIn feed virtualises and recycles post nodes, so a
re-resolved "match" could be a different post's comment box — the one failure
mode that would make modaicom untrustworthy. Refuse-and-re-trigger is the safe
cost.

### The Inline Targeting Session is extended

Previously it ended at "terminal handoff of the extraction result." It now lives
until the first of: an SPA route change, a fresh trigger click anywhere, or the
5-minute relay TTL. It spans extraction **and** generation **and** one-or-more
insertions. A successful insert does not end it — Regenerate → Insert again
works without re-triggering.

### Non-empty editor: refuse

If the target editor contains anything other than emptiness, Insert **refuses**
(`editor-not-empty`) and Copy remains offered. modaicom never replaces, appends
to, prepends to, or prompts-to-replace text a person wrote — ADR-0001's "consent,
review, trust" applied to the user's own words. "Empty" is structural: no text
after trimming, ignoring a stray `<br>` / empty `<p>` / LinkedIn's placeholder.

**One exception:** if the editor contains *only* a draft modaicom inserted
earlier this session and the user has not touched it (byte-identical to what
modaicom last wrote), a re-insert may replace it. One edited character makes it
user work again → refuse.

### Insertion technique

`document.execCommand('insertText', …)` for contenteditable; native value setter
+ an `input` event for a `textarea`. `execCommand` is deprecated but universally
implemented in Chrome (the only target) and is the one method that routes through
the real editing pipeline, so Quill (`legacy`) and TipTap/ProseMirror (`sdui`)
both accept it, a genuine `beforeinput`/`input` fires, and the user can Ctrl-Z
it. Hand-rolled `InputEvent`s are `isTrusted: false` and ProseMirror ignores
them; reaching into the editors' framework instances couples us to LinkedIn's
minified internals.

After the write the content script **reads the text back**; if `execCommand`
returned false or the readback does not contain the draft, it refuses
(`insert-failed`) — it does **not** fall back to raw DOM mutation, which is the
path that leaves LinkedIn's Post button dead. A future editor that rejects
`execCommand` is a fail-closed `insert-failed` plus an adapter-version bump —
the same discipline the read adapters follow.

After a successful insert: focus stays in the editor, caret at the end of the
inserted text. Nothing is scrolled or clicked.

### Transport

Insert travels **popup → content script** directly via `chrome.tabs.sendMessage`
— the pattern ADR-0004 established for `REQUEST_PAGE_EXTRACTION`. A new additive
`INSERT_DRAFT { version: RELAY_VERSION, type, text, sessionId, generation }`
message in `shared/protocol.ts`; **no `RELAY_VERSION` bump** (purely additive,
popup and content script ship in one build, unknown types already ignored). The
reply is `{ ok: true } | { ok: false; reason }`.

The **service worker never sees the draft or the insert command.** The draft's
only homes remain the open popup and — after insert — the LinkedIn editor. It is
still never persisted (ADR-0008) and the content script's diagnostics never
record it.

### Failure taxonomy

`editor-unavailable`, `route-changed`, `editor-not-empty`, `insert-failed`
(content side) and `wrong-tab` (a `chrome.tabs.sendMessage` rejection, popup
side). Each maps to fixed, actionable, selector-free popup copy — the
`generationErrorMessages` / `contextMessages` house style. Every failure keeps
the draft and Copy on screen.

## 2. Inline-trigger redesign

### Shadow DOM + adoptedStyleSheets

The trigger is a button injected into a heavily-styled, CSP-bearing,
frequently-redesigned third-party page. It is rebuilt inside a **shadow root** on
its wrapper host, styled from **one bundled `inlineTrigger.css`** applied via
`adoptedStyleSheets`. LinkedIn's CSS cannot reach in; ours cannot leak out; the
style source is a single file, not strings scattered through DOM code. Light-DOM
alternatives (injected `<style>`, manifest `content_scripts[].css`) all leave
LinkedIn's global rules bleeding onto our button, making every LinkedIn redesign
a potential visual regression.

Cost: tests move from `wrapper.querySelector('button')` to
`wrapper.shadowRoot.querySelector('button')` (jsdom 30 supports shadow DOM +
`adoptedStyleSheets`).

### Theme-independent filled design

A solid `#5b3fd6` 28px squircle with the white **m** mark — no "modaicom" text.
It carries its own background, so LinkedIn's in-app light/dark toggle (which is
independent of the OS and exposed only through class names LinkedIn renames)
**does not need detecting**. There is no theme-detection code. A
`prefers-color-scheme` block may soften the shadow/ring on dark as a nicety only.
The filled brand purple also keeps it unmistakably distinct from LinkedIn's grey
ghost-style native actions.

### Placement: docked in the comment action row

**Amended 2026-08-31** (superseding the original 0×0-anchor placement below).
The trigger is a small inline-flex icon placed **immediately left of LinkedIn's
emoji button** in the comment/reply action row — `findEmojiButton` climbs a few
levels from the editor and takes the emoji-labelled button in the nearest
containing ancestor, then `insertBefore`. If that button can't be found (label
changed) it falls back to placing the trigger after the editor. It flows with
LinkedIn's own icons rather than floating, so it reads as part of the composer.

*Original decision (kept for history):* the host was a 0×0 in-flow anchor with an
absolutely-positioned button offset past the composer's right edge — zero layout
impact, no scroll/resize handlers. Moved into the icon row on user feedback that
the floating position looked detached and clipped.

### States and label

hover / focus-visible / pressed / disabled / loading (during extraction,
`aria-busy`), all in the one stylesheet, reusing the popup's colour tokens.
`aria-label` keeps the interaction distinction — "Generate a comment with
modaicom" / "Generate a reply with modaicom"; a custom shadow-DOM tooltip
(`aria-hidden`) shows the shorter "Generate with modaicom"; no `title` attribute.

## No manifest change

Same hosts, same permissions. No `web_accessible_resources` (the mark is
CSS-rendered; the stylesheet is bundled into the content-script JS). No
`scripting`/`tabs` addition (`chrome.tabs.sendMessage` from an extension page
needs no `tabs` permission).

## Opening the popup on trigger click

**Amended 2026-08-31.** After the content script relays a fresh extraction
result, the service worker calls `chrome.action.openPopup()` (best-effort,
`.catch` swallowed) so the popup opens on the trigger click without a second
click on the toolbar icon. It fires only when `writeRelay` *accepts* the result,
so the popup opens to the just-written context with no race. Silently a no-op
where the browser disallows it (older Chrome, a popup already open) — the manual
open still works.

## Not doing

Automatic Post/Reply (ADR-0001), auto-engagement, multiple/ranked drafts
(ADR-0010), a page-side Insert affordance (Insert lives in the popup where the
draft is), new providers, local AI, analytics.
