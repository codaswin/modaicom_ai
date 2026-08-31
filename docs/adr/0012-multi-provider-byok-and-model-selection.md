# Multi-provider BYOK and dynamic model selection

Status: accepted on 2026-08-31 (grill-with-docs). Amends ADR-0007 and ADR-0008.
Builds on ADR-0010. ADR-0001 unchanged.

Phase 5 shipped one provider (OpenAI) behind a provider-neutral `AIProvider`
interface, with the model as a free-text string. Phase 9 adds four more providers
(Gemini, Anthropic, Groq, xAI) and replaces the free-text model field with a
validated, provider-fetched dropdown.

## Provider abstraction: one shared transport + presets + one dedicated adapter

Four of the five providers speak the OpenAI wire protocol
(`POST /chat/completions`, `Authorization: Bearer`, `GET /models`): OpenAI,
Groq, xAI, and Gemini (via its OpenAI-compatibility endpoint). Only **Anthropic**
is genuinely different (`x-api-key` + `anthropic-version`, `POST /v1/messages`,
top-level `system`, required `max_tokens`, `content[]` response).

- A **shared `openai-compatible` transport** implements `generate` and
  `listModels` once, parameterised by a **Provider Preset** (declarative data:
  base URL, key-auth style, list-models endpoint + response shape, model filter,
  curated fallback models).
- A **dedicated `anthropic` adapter** implements the same `AIProvider` interface.
- The **registry** holds five presets; `getProvider(id)` returns an `AIProvider`
  bound to its preset. **Provider identity appears only as a lookup key** — never
  a branch in the generation layer, the service worker, or the options page.
  This was the hard constraint: no `if (provider === 'gemini')` anywhere.
- **`listModels` joins the `AIProvider` interface.** It is a first-class,
  individually mockable capability, not a side module that switches on provider
  id (which would be the same branching, relocated).
- **Gemini** generates through its OpenAI-compat endpoint (shared transport) but
  **lists and tests through its native `GET /v1beta/models`** — the compat
  `/models` list is bare, while the native list carries
  `supportedGenerationMethods` and `displayName`, which is exactly what model
  filtering needs. Both endpoints and the `models/` prefix normalisation live in
  the Gemini preset as data.

Rejected: five fully separate adapter modules (≈90% duplicated across four; a
protocol fix applied five times). Rejected: a fully native Gemini adapter (a
third request/response mapping for no generation-time benefit).

## No key-prefix provider sniffing

modaicom never infers a provider from the shape of an API key. "Test connection"
calls the **selected** provider's `GET /models` with the key; a `401/403` means
"this key is not valid for this provider" and the message says exactly that —
*"This API key isn't valid for the selected provider. Check your provider or API
key."* It does not say "that looks like an OpenAI key". Key-shape heuristics are
brittle, leak which service a user holds credentials for, and invite
false-confident autocorrect.

## Model identity

The persisted value is always the **stable model ID** — the string the API's
`model` field wants — and nothing else. `ModelInfo` is `{ id; label? }`; `label`
is a display-only friendly name (from `display_name` / `displayName` where the
provider supplies one), recomputed each time the list loads, never persisted,
never sent to a provider. A display name in storage is a liability: providers
rename, and it is not what the request needs.

## Filtering and the fallback ladder

- Filtering to text-generation models is a **pure `modelFilter`** reading the
  preset's declarative rules — allow/deny ID patterns for the OpenAI-shaped
  lists (brittle, but isolated to one preset each), a capability predicate for
  Gemini and Anthropic.
- A failed or empty `listModels` is **not** a blocking error. The connection is
  still `{ ok: true }`; the dropdown shows the preset's curated `fallbackModels`
  with a "showing known options" note; a "type a model ID" field is always
  available for any provider. The curated lists will go stale — the manual field
  is the real safety net, and ADR-0007 already made the model a free string.

## Storage layout, per-provider

`chrome.storage.local` (never `sync`):

- `modaicom.provider.active` — the selected provider id.
- `modaicom.provider.<id>.apiKey` — one key per provider, retained across
  switches (location unchanged from Phase 5). The options-page field is
  write-only: a "key saved ✓" indicator, never the value (ADR-0008).
- `modaicom.provider.<id>.model` — the model chosen for that provider,
  remembered independently.
- `modaicom.provider.<id>.consent` — per-provider transmission consent (amends
  ADR-0007).

The record generation reads is *derived*: `{ providerId: active,
model: model[active], baseUrl: preset(active).baseUrl }`. The user-facing Base
URL field is **removed** — the endpoint comes from the preset, and arbitrary
OpenAI-compatible endpoints are out of scope (consistent with excluding
Ollama / LM Studio).

A **lazy read-path migration** converts the v1.0.0 single record on first read
after the update: a recognised custom `baseUrl` maps to its now-first-class
provider (and that provider's key moves with it); an unknown `baseUrl` keeps
`openai` and is dropped. The `openai` key location never moves, so at worst a
migrated user re-Tests and re-consents.

## Validate before save (amends ADR-0008)

ADR-0008 said "the key never enters a runtime message" — written to keep the key
away from the **content script and the LinkedIn page** (hostile-adjacent, no
`chrome.*`). Phase 9 scopes that clause to that boundary. The setup flow needs
to validate a key *before* persisting it, so:

- One SW operation `TEST_AND_LIST { providerId, apiKey }` carries the key
  **transiently, for that call only**. The SW **never persists a key it received
  in a message** — the options page remains the only writer, and it writes only
  after `{ ok: true }`.
- An options-page → SW message is the same trust boundary as the options page
  writing to `chrome.storage.local` directly, which ADR-0008 already permits.
- The service worker remains the **sole network caller** — the options page
  never `fetch`es a provider.

`TEST_AND_LIST` is the model-list call; test and list are one round trip, zero
token cost. `TEST_PROVIDER` (a real `ping` generation) is removed.

## Consent, per provider (amends ADR-0007)

ADR-0007 already required a fresh consent per provider and a disclosure naming
that provider. Phase 9 stores the consent per-provider and templates the
disclosure string on the selected provider's name ("…sent to **Groq**, governed
by Groq's terms"). Switching back to an already-consented provider does not
re-prompt. `preflight` checks `modaicom.provider.<active>.consent`.

## Errors stay small and provider-independent

`GenerationErrorKind` gains exactly one member: **`model-not-available`**
(non-retryable; generation-time `404` / model-not-found; the popup routes it to
settings, where "retry" would be useless). Everything else reuses the existing
union. Provider/key mismatch is `authentication-failed` with surface-specific
copy. Model-list failure is a result field, not an error kind. Every adapter's
only job is mapping its HTTP reality onto the same twelve kinds; response bodies
are never surfaced (ADR-0008).

## Least-privilege host permissions, no CSP change

Five provider hosts in `optional_host_permissions`; the options page requests
the one host for the provider being configured, before Test. Nothing is added to
`host_permissions`; there is no CSP change (the SW `fetch` is not governed by the
extension-pages `connect-src`); there are no wildcards. ADR-0008's least-privilege
model extends unchanged.

## Tone / Intent / Length untouched

`preferencesToInstructions`, `buildGenerationInput`, and the
`{ system, user } + temperature + maxTokens` contract do not change. Adapters
only translate to wire format. `TEMPERATURE = 0.6` is valid on every provider
(a note records that > 1.0 breaks Anthropic). A reserved, unused preset flag
`systemPromptStrategy` is the escape hatch if a provider ever needs different
prompt placement — never a code branch.

## In-flight provider switch

No new mechanism. `preflight` snapshots the provider/key/model once at kickoff;
the generation is bound to the popup Port's lifetime, and opening settings closes
the popup and aborts it. A config change lands on the next Generate. Silently
re-sending LinkedIn text to a different company would violate ADR-0001/0007.

## Not doing

Ollama / LM Studio / local LLMs; NVIDIA NIM / Nemotron; arbitrary
OpenAI-compatible endpoints; automatic provider fallback; streaming; ranked or
multiple suggestions (ADR-0010); a hosted proxy (ADR-0007); analytics. modaicom
makes no promise that any provider's models or free tier will remain available.
