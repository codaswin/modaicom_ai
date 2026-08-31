# Phase 7 manual Chrome smoke test — AI Suggestion Generation

**Status: Pending validation**

Record only date, browser / extension build, area, pass/fail, and a short
non-sensitive symptom. Never record API keys, LinkedIn content, or provider
responses. Tone / intent / length ids are not sensitive but there is no reason to
record them.

| Date | Browser / extension build | Area | Result | Symptom |
|---|---|---|---|---|
| | | Tone fidelity (all four) | Pending | |
| | | Intent fidelity (all six) | Pending | |
| | | Short vs Medium vs Long, same post | Pending | |
| | | Current selection used (change then Generate) | Pending | |
| | | Regenerate after a control change | Pending | |
| | | post-comment vs comment-reply | Pending | |
| | | Error paths (offline / 401 / 429) | Pending | |

## Setup

1. `npm run check`, load `dist/` unpacked. A provider must already be configured
   and consented (Phase 5). Re-read the consent text on the options page — it now
   names the tone/intent/length triple.
2. On a `legacy` LinkedIn post, click the `modaicom` trigger beside the comment
   composer and open the popup.

## Tone

3. Fix Intent = Add insight, Length = Medium. Generate once per tone:
   - **Professional** — no slang, no exclamation marks, complete sentences.
   - **Friendly** — contractions, warm, first person; not stiff.
   - **Confident** — leads with the point, no "maybe / I think / it seems".
   - **Thoughtful** — names a nuance or trade-off, shows reasoning.
   Each should read audibly different from the others.

## Intent

4. Fix Tone = Professional, Length = Medium. Generate once per intent on a post
   that has an opinion and (ideally) a question in it:
   - **Support** — agrees and adds a specific reason, not just "great post".
   - **Add insight** — introduces something the post didn't say.
   - **Ask a question** — ends with exactly one specific question.
   - **Answer** — answers the post's question in the first sentence.
   - **Disagree** — names a specific claim and pushes back, still civil.
   - **Congratulate** — specific, sincere; only sensible on an achievement post.

## Length

5. Fix Tone + Intent. Generate at **Short**, then **Medium**, then **Long** on the
   same post. Short ≈ 1–2 sentences, Medium ≈ 3–4, Long ≈ 5–7 (up to two short
   paragraphs). The three must be visibly different lengths — not three variations
   of the same paragraph.

## Current selection

6. Open the popup, immediately change Length to Long, click Generate right away.
   The draft is long — the pre-hydration default did not win.
7. With a draft shown, change Tone, click **Regenerate**. The new draft reflects
   the new tone.
8. Reopen the popup on the same post — the last tone/intent/length is still
   selected.

## Interaction type

9. On a comment-reply trigger (legacy), the same controls apply and the draft
   still addresses the *comment*; the popup header reads "Replying in …'s thread".

## Errors and lifecycle

10. Disconnect the network, Generate → "Could not reach your provider" + Retry.
    Reconnect, Retry → draft.
11. Temporarily set a bad key on the options page → Generate → "Your API key was
    rejected", Open settings (not Retry).
11a. Configure the key but leave the consent box unticked → the popup panel reads
    "One more step: consent…", not the generic setup copy.
11b. Reload only the popup while the service worker is torn down mid-protocol
    change (or load a `dist/` whose worker is stale) → the panel reads "Couldn't
    reach modaicom's background worker… Reload the extension", with Retry — not
    "Open settings". A DEV build also logs a `[modaicom]` console.warn.
12. Generate, then **Stop** → back to the Generate button, no draft.
13. Generate, close the popup mid-request → reopen; no stuck spinner.

## Privacy spot-check (dev)

14. DevTools on the service worker, Network tab during a generation: the single
    request to `api.openai.com/v1/chat/completions` body carries only the authored
    post/comment text and a `system` string built from the three instructions —
    no author names, no `urn:li:`, no URL, no page HTML. `temperature` and
    `max_tokens` are present. The `{tone,intent,length}` ids appear only inside
    the `system` instruction text, nowhere as raw fields.

See [ADR-0010](../adr/0010-wiring-preferences-into-generation.md),
[ADR-0009](../adr/0009-response-controls-tone-intent-length.md), and
[ADR-0007](../adr/0007-linkedin-content-transmission-and-byok-boundary.md).
