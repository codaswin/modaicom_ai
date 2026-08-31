# Phase 9 — Multi-Provider BYOK + Dynamic Model Selection

Status: Specified on 2026-08-31 (grill-with-docs → to-spec). Recorded in ADR-0012;
amends ADR-0007 and ADR-0008. Builds on ADR-0010.

## Problem Statement

modaicom only talks to OpenAI. A user who prefers Gemini, Anthropic, Groq, or
xAI — or who has free credits on one and not another, or whose employer allows
one vendor and not the others — can't use the extension without an OpenAI key.
And the one thing they must configure, the model name, is a free-text field they
have to know by heart and keep in sync with the provider's deprecation calendar.

## Solution

The options page becomes a small, provider-agnostic setup flow:

> **Provider** [ Gemini ▼ ]  **API Key** [ ••••••••• ]  [ Test connection ]  ✓ Connected  **Model** [ available models ▼ ]

- Five providers: **OpenAI, Gemini, Anthropic, Groq, xAI (Grok)**. Each is a
  registry preset behind the unchanged `AIProvider` interface — the generation
  and UI layers never branch on provider identity.
- **One visible API-key field.** modaicom retains one key per provider
  internally, so switching Gemini → Groq → Gemini never asks for a key twice.
  The field is write-only: it shows "key saved ✓", never the value.
- **Test connection** validates the key against the *selected* provider (a
  `GET /models` call). On success it also fetches the provider's models, filters
  them to text-generation models, and fills the Model dropdown. On a `401` it
  says *"This API key isn't valid for the selected provider. Check your provider
  or API key."* — it never guesses the real provider from the key's prefix.
- The chosen model and the per-provider consent are persisted; the key is
  persisted only after a successful Test.
- Tone / Intent / Length behave identically on every provider — the prompt layer
  is untouched; each adapter only translates the neutral `{ system, user }` to
  its wire format.

## User Stories

### Choosing and configuring a provider

1. As a user, I want to pick my AI provider from a short list (OpenAI, Gemini,
   Anthropic, Groq, xAI), so that I'm not forced onto OpenAI.
2. As a user, I want one API-key field that always refers to the provider I've
   selected, so that the settings page stays simple.
3. As a user who tries two providers, I want modaicom to remember each provider's
   key, so that switching back and forth doesn't make me re-paste keys.
4. As a user, I never want to see my API key echoed back on screen — only a
   "saved ✓" indicator — so that a shoulder-surfer or a screenshot can't capture
   it.
5. As a user, I want a per-provider "Remove key" so that I can clear a credential
   I no longer want stored.
6. As a user, I want the Base URL field gone — I pick a named provider and
   modaicom knows its endpoint.

### Testing the connection

7. As a user, I want a "Test connection" button that tells me plainly whether my
   key works for the provider I picked.
8. As a user who pasted the wrong key for the selected provider, I want a clear
   message — "This API key isn't valid for the selected provider" — not a guess
   that reveals which provider the key *is* for.
9. As a user, I want distinct, honest messages for "rate-limited", "couldn't
   reach the provider", "the provider errored", and "the check timed out", so
   that I know whether to retry or fix something.
10. As a user, I don't want "Test connection" to cost me tokens — it should be a
    metadata call, not a generation.
11. As a user, I want "Connected ✓" to mean *just verified*, not "worked once
    last week" — so it disappears the moment I change the key.

### Choosing a model

12. As a user, after a successful Test I want the Model dropdown populated with
    the models that provider actually offers, so that I'm not typing IDs from
    memory.
13. As a user, I want embedding / image / audio / TTS / moderation / realtime
    models filtered out, so that the dropdown only shows things that can draft a
    comment.
14. As a user, I want the model list to show a friendly name where the provider
    gives one (e.g. "Claude Sonnet 5"), with the exact ID visible too.
15. As a user, if the model list can't be fetched, I want a short list of
    known-good models for that provider plus the ability to type a model ID
    myself, so that a flaky list endpoint doesn't block me.
16. As a user, I want modaicom to remember the model I chose for each provider
    independently, so that returning to Gemini restores my Gemini model.
17. As a user, I want to change only the model — provider and key unchanged —
    without being forced to re-run Test connection.
18. As a user, I never want a display name persisted or sent to a provider —
    only the stable model ID.

### Consent and privacy

19. As a user, I want to consent per provider, with the disclosure naming that
    specific provider and saying its terms govern the text, so that "I consent"
    is informed.
20. As a returning user, I don't want to re-consent to a provider I've already
    consented to.
21. As a privacy-conscious user, I want my key to reach the provider only via
    the service worker — never the content script, never the LinkedIn page — and
    never to be written to storage from a message.
22. As a privacy-conscious user, I want modaicom to grant itself network access
    only to the provider hosts I actually configure, one at a time.

### Generation across providers

23. As a user, I want Tone, Intent and Length to work the same on every provider
    — the controls aren't per-provider.
24. As a user, I want a broken or truncated response handled the same way on
    every provider (clear error or the partial draft, never a crash).
25. As a user who typed a model ID that no longer exists, I want a specific
    "that model isn't available, pick another in settings" message, not a
    useless "retry".
26. As a user, if I open settings and change my provider while a draft is
    generating, I don't want that in-flight draft silently re-sent to the new
    provider.

### Maintainer

27. As a maintainer, I want provider-specific behaviour confined to one dedicated
    adapter (Anthropic) or to declarative preset data — never `if provider ===`
    in the generation or UI code.
28. As a maintainer, I want four of the five providers to share one transport
    module, so a protocol-level fix is applied once.
29. As a maintainer, I want `listModels` to be a first-class, individually
    mockable capability on `AIProvider`.
30. As a maintainer, I want the error union to stay small and provider-
    independent — the same kinds describe all five providers.
31. As a maintainer, I want deterministic tests that never touch a real API, with
    a guard that fails any test which makes an unmocked network call.
32. As a maintainer, I want a one-time, lazy migration of the existing
    single-provider config so v1.0.0 users aren't disrupted.
33. As a maintainer, I want no CSP change and no wildcard host permission.

## Implementation Decisions

### Provider abstraction

- The `AIProvider` interface keeps `{ id, generate(input, opts) }` and **gains
  `listModels(opts): Promise<ModelListResult>`**. `ModelListResult` is
  `{ ok: true; models: ModelInfo[] } | { ok: false; error: GenerationError }`;
  `ModelInfo` is `{ id: string; label?: string }` (`label` is display-only).
- A **shared OpenAI-compatible transport** implements `generate` + `listModels`
  once, parameterised by a **Provider Preset**. It serves **OpenAI, Groq, xAI,
  and Gemini** (Gemini via its OpenAI-compatibility endpoint for generation).
- A **dedicated Anthropic adapter** implements the same interface: `x-api-key` +
  `anthropic-version` auth, top-level `system`, required `max_tokens`,
  `content[]` response, `GET /v1/models`.
- The **registry** holds five presets and `getProvider(id)` returns an
  `AIProvider` bound to its preset. Provider identity appears **only** as a
  lookup key — never a branch in generation, the SW, or the options page.
- A **Provider Preset** is declarative data: `{ id, label, baseUrl, keyAuth
  ('bearer' | 'x-api-key' | 'x-goog-api-key'), listModels (endpoint + response
  shape + keep-predicate), modelFilter (allow/deny id patterns), fallbackModels
  }`.
- **Gemini** lists and tests via its **native `GET /v1beta/models`** (capability
  metadata: `supportedGenerationMethods`, `displayName`) while generating via the
  compat endpoint. The `models/` id prefix is normalised in that preset's
  `listModels`. Both endpoints are preset data.
- **No provider is identified from an API-key prefix**, anywhere.

### Model filtering and fallback

- Filtering to text-generation models is applied by a pure `modelFilter`
  function reading the preset's declarative rules: allow/deny ID patterns for
  OpenAI and the OpenAI-shaped lists; a capability predicate
  (`supportedGenerationMethods` includes `generateContent`) for Gemini; a
  near-passthrough for Anthropic (its list is all chat models).
- If `listModels` fails or returns nothing usable, the connection result is
  still `{ ok: true }` with `modelSource: 'fallback'` and the preset's curated
  `fallbackModels`. A "type a model ID manually" affordance is always available
  for any provider.
- The persisted value is always the plain stable ID, regardless of source.

### Test-connection + list-models flow

- One service-worker operation: `TEST_AND_LIST { providerId, apiKey }` →
  `{ ok: true; models: ModelInfo[]; modelSource: 'live' | 'fallback' } |
  { ok: false; error: GenerationError }`.
- The SW uses the key **for that call only and never persists it**. The options
  page persists the key + config **only after `ok: true`** (validate-before-save).
- The test call is the model-list call (`GET /models` / `GET /v1beta/models`).
  `200` → valid + list; `401/403` → `authentication-failed` rendered with
  options-page copy ("not valid for the selected provider"); `429`/`5xx`/network/
  timeout → their existing typed kinds, retryable.
- The options page requests the selected provider's **host permission** before
  firing `TEST_AND_LIST`.

### Storage and status

- Per-provider layout in `chrome.storage.local` (never `sync`):
  `modaicom.provider.active` (id), `modaicom.provider.<id>.apiKey` (unchanged
  location), `modaicom.provider.<id>.model`, `modaicom.provider.<id>.consent`.
- The active config generation reads is *derived*: `{ providerId: active,
  model: model[active], baseUrl: preset(active).baseUrl }`. The user-facing Base
  URL field is removed.
- `keyStore` gains `readSetupSummary() → { active: { providerId, model },
  providers: Record<id, { hasKey: boolean; hasConsent: boolean }> }` — **no key
  value**. The options page imports it directly (ADR-0008 permits options-page
  keyStore access). The popup's `GET_PROVIDER_STATUS` reply is extended with
  `providerLabel`.
- A **lazy read-path migration**: the first read after the update transforms the
  v1.0.0 `{ providerId, model, baseUrl? }` + single consent into the per-provider
  layout, mapping a recognised custom `baseUrl` to its now-first-class provider
  (and moving that provider's key), else keeping `openai` and dropping `baseUrl`.

### Consent (amends ADR-0007)

- Consent is per-provider, stored at `modaicom.provider.<id>.consent`. The
  disclosure text is templated on the selected provider's name and says that
  provider's terms govern the transmitted text. `preflight` checks the active
  provider's record.

### Errors (amends nothing structural)

- `GenerationErrorKind` gains exactly one member: **`model-not-available`**
  (non-retryable, mapped from a generation-time `404` / model-not-found; the
  popup routes it to settings). Provider/key mismatch is `authentication-failed`
  with surface-specific copy. Model-list failure is a result field, not an error.
- All five adapters map the HTTP error matrix onto the same kinds:
  `401/403 → authentication-failed`, `429 → rate-limited`,
  `5xx → provider-error`, network → `network-error`, timeout → `request-timeout`,
  `404 → model-not-available`. Response bodies are never surfaced (ADR-0008).

### Prompt / generation layer

- `preferencesToInstructions`, `buildGenerationInput`, and the
  `{ system, user } + temperature + maxTokens` contract **do not change**.
- Each adapter translates that contract to its wire format. Anthropic maps
  `input.system` → the `system` parameter, `input.user` → `messages`, and always
  sends a `max_tokens` (a constant fallback if `opts.maxTokens` is unset).
- `TEMPERATURE = 0.6` is valid on every provider; a code note records that
  raising it past 1.0 breaks Anthropic.
- Every adapter mirrors Phase 7's truncation policy (`finish_reason: 'length'` /
  `stop_reason: 'max_tokens'` with non-empty content → `ok: true`).
- A reserved (unused) preset flag `systemPromptStrategy` is the escape hatch if a
  provider ever needs different prompt placement — never a code branch.

### Protocol and permissions

- `GENERATION_PROTOCOL_VERSION` bumps **2 → 3** as a lockstep cutover across
  every generation message, guard, and call site. `TEST_PROVIDER` is removed
  (replaced by `TEST_AND_LIST`), not aliased.
- `manifest.config.ts` `optional_host_permissions` lists all five provider hosts;
  none are added to `host_permissions`. No CSP change. No wildcards.

### In-flight provider switch

- No new mechanism. `preflight` snapshots `{ providerId, model, apiKey, baseUrl }`
  once at kickoff; the generation is bound to the popup Port's lifetime (opening
  settings closes the popup and aborts it). A config change lands on the next
  Generate. A test locks this in.

### Settings state machine

- No automatic network calls. On load: reflect stored state; show a short-TTL
  per-provider cached model list if present.
- "Connected ✓" is a this-session verification state, never persisted.
- Editing the key or switching provider clears "Connected ✓"; Save is disabled
  until a fresh Test.
- Save is enabled when a model is selected, consent is present, **and** either a
  this-session Test succeeded with the current key **or** the key field is
  untouched and a previously-validated stored key exists.
- Manual model-ID entry does not require a re-Test.

## Testing Decisions

A good test asserts observable behaviour at a module's public surface — the
outbound request a provider builds, the typed result it returns, what the SW
persists (and doesn't), what the options page renders and in what order — never a
private helper. No test makes a real network call.

### Seams (prefer existing, highest possible, fewest)

- **The provider adapters (`generate` + `listModels`), via a mocked `fetch`.**
  The existing `providers/openai.test.ts` pattern — stub `fetch`, call the real
  adapter, assert on the request and the mapped result. The shared transport
  gets one thorough suite; each OpenAI-shaped preset a light suite for its
  `baseUrl` + `modelFilter`; the Anthropic adapter a full request/response/error
  matrix. This is the primary seam and it already exists.
- **`modelFilter` — pure function.** Given a raw list and a preset's rules,
  returns the kept `ModelInfo[]`. Prior art: the pure-function tests in
  `features/generation/*.test.ts`.
- **The `TEST_AND_LIST` SW handler, via mocked `fetch` + mocked
  `chrome.storage`.** Prior art: `background/generation.test.ts`. Must assert the
  key from the message is **never written to storage**, and that a 401 returns
  the typed error with no persistence.
- **`keyStore` — mocked `chrome.storage`.** Per-provider read/write, `hasApiKey`,
  `readSetupSummary` (no key values), and the lazy migration (seed v1.0.0 keys →
  read → assert the new layout, including `baseUrl`→provider mapping).
- **`shared/protocol.ts` guards — existing `protocol.test.ts`.** `TEST_AND_LIST`
  accept/reject table; `GENERATION_PROTOCOL_VERSION === 3`.
- **`Options.tsx` — mocked messaging + `keyStore`, existing `Options.test.tsx`.**
  The select → Test → list → pick → consent → Save sequence; "Connected ✓"
  clears on key edit; Save gating; provider-switch reset; manual model entry.
- **A parametrised `it.each(PROVIDERS)` error table** asserting every adapter
  maps the HTTP matrix onto the same `GenerationErrorKind` values — enforces
  provider-independence in CI.
- **`src/test/setup.ts` gains an unmocked-`fetch` guard** — the default `fetch`
  throws, so any test that forgets to stub it fails loudly and no test can reach
  a real provider.

Automated tests prove *request shaping, response mapping, filtering, persistence,
and the settings sequence*. A per-provider **manual smoke test** proves each
provider actually generates and actually obeys Tone / Intent / Length (Phase 7's
split: tests prove the knobs are set; the smoke test proves the model listens).

## Out of Scope

- Ollama, LM Studio, any local LLM runtime.
- NVIDIA NIM / Nemotron.
- Arbitrary user-supplied OpenAI-compatible endpoints (the Base URL field is
  removed; only the five named providers).
- Automatic provider fallback / failover.
- Automatic posting, replying, or engagement (ADR-0001).
- Analytics or telemetry of any kind.
- Streaming responses.
- Ranked or multiple suggestions (ADR-0010).
- A hosted proxy or any modaicom backend (ADR-0007).
- Promising that any provider's models or free tier will remain available.

## Further Notes

- **ADR-0012** records this phase. **ADR-0007** is amended for per-provider
  consent + templated disclosure. **ADR-0008** is amended so "the key never
  enters a runtime message" is scoped to the content-script / page boundary (an
  options-page→SW test message may carry it transiently; the SW never persists a
  key received in a message), and for five least-privilege optional hosts.
- CONTEXT.md gains **Provider Preset**, **Model Filter**, **Connection Test**;
  **AI Provider**, **Provider Configuration**, **Transmission Consent**, and
  **Generation Error** are updated.
- The curated `fallbackModels` per preset are a convenience shown only on a
  listing failure and will go stale; the manual model-ID field is the real
  safety net.
- Not every OpenAI-shaped list gives capability metadata; OpenAI's and the
  compat lists are filtered by ID pattern, which is inherently brittle and
  isolated to one preset each — the fallback path exists to catch that.
- The phase is not complete until a dated manual smoke test passes for **every**
  provider on a real LinkedIn post: configure, Test, pick a model, Generate,
  and confirm Tone / Intent / Length visibly steer the draft.
