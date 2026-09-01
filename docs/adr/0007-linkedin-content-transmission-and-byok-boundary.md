# LinkedIn-content transmission, consent, and the BYOK provider boundary

Status: accepted on 2026-08-30 (grill-with-docs). **Partially supersedes ADR-0002
and ADR-0003** — their no-transmission clauses. ADR-0001 is unchanged.

Phase 5 introduces AI-assisted drafting. To generate a response, the authored
text the user explicitly selects must be sent to an AI provider. Every prior ADR
guaranteed that extracted LinkedIn content never leaves the browser; this ADR
records the deliberate, bounded reversal.

## What is transmitted, and on whose authority

- **Only a Generation Request leaves the device**: `{ interactionKind, postText }`
  for a post-comment, plus `commentText` for a comment-reply. Nothing else.
- **From Phase 7, also**: the `{ tone, intent, length }` id triple the user
  selected in the popup (ADR-0010). These are the user's own three menu choices —
  no LinkedIn content, no PII, no author or page data — and they travel as a
  separate message field, not inside the Generation Request.
- **Never transmitted**: author display names, author headline, the
  `urn:li:activity:` / `urn:li:comment:` identifier, the publication-time label,
  any URL, DOM, HTML, cookies, account identifiers, the user's editor contents,
  analytics, or unrelated page content. The minimisation is the mechanism, not a
  nicety — it keeps the transmitted text decontextualised.
- **The transmitted text is third-party authored content** — written by the post
  author and, for a reply, the commenter, who have not consented and cannot.
  modaicom does not pretend otherwise: the consent disclosure states that the
  user is choosing to send other people's public LinkedIn text to their own AI
  provider, that the *provider's* terms and retention policy govern it, and that
  this is the user's call (as it would be pasting the text in by hand). The
  content is bounded to what the user can already see (published posts/comments,
  not private messages).

## When it is transmitted

- Only after an explicit **Generate** click in the popup. Nothing is ever
  auto-generated.
- Only when a **Transmission Consent** record `{ providerId, consentedAt }` exists
  in `chrome.storage.local`. The user grants it once per provider, with a
  plain-language disclosure of exactly what is sent and where — from Phase 7 the
  disclosure also states that the selected tone, intent and length go with it.
  Switching providers requires a fresh consent. The service worker refuses to
  transmit without a matching record (`transmission-not-consented`).
- Each generation is one billable call against the user's key; the disclosure
  says so; there is no automatic retry.

## BYOK, no shared backend

modaicom operates **no server and no shared API key**. The user supplies their
own provider key (BYOK). A hosted proxy was considered — it would allow key
hiding, rate management, and a smoother setup — and rejected: it would put every
user's LinkedIn content and provider traffic through infrastructure modaicom
would have to be trusted to run, contradicting the project's "no backend,
nothing to trust" posture. No backend is introduced.

## First provider

OpenAI via `POST /v1/chat/completions`, non-streaming, is the reference
implementation, chosen because that request/response shape is the de-facto
standard the OpenAI-compatible ecosystem (Groq, OpenRouter, Ollama, LM Studio,
Together) mirrors — so one `baseUrl`-parameterised provider module later covers
them as config presets. The provider-neutral `AIProvider` interface keeps modaicom
from becoming OpenAI-specific; Anthropic and Gemini remain distinct future impls.
The model is a user-configurable string from Phase 5 (`{ providerId, model,
baseUrl? }`), not hard-coded — a hard-coded model is a single point of failure on
the provider's deprecation calendar and blocks compatible-provider presets.

## Unchanged

ADR-0001's user-controlled-publication guarantee stands: Phase 5 produces a
**Generated Draft** the user copies by hand. No editor insertion, no posting, no
automatic engagement. ADR-0002/0003's read-only-extraction, structural-only
pre-click observation, and no-logging guarantees stand for everything except this
one explicitly-consented transmission path.

## Amendment — 2026-08-31 (ADR-0012, Phase 9: five providers)

"Switching providers requires a fresh consent" is now realised as **per-provider
stored consent** (`modaicom.provider.<id>.consent`), not one global record. The
disclosure string is templated on the selected provider's name and states that
*that* provider's terms and retention policy govern the transmitted text.
Switching back to an already-consented provider does not re-prompt. `preflight`
checks the active provider's record. The substance is unchanged — informed,
provider-specific, one-time-per-provider consent, checked before any transmission.
