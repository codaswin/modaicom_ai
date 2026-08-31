# modaicom

modaicom is an open-source Chrome extension for AI-assisted LinkedIn responses with the user in control. Phase 0 and Phase 1 provide the extension foundation and LinkedIn detection; Phase 2 extracts Primary Post context from supported individual LinkedIn post pages; Phase 3 targets the Owning Post of an explicitly clicked inline `modaicom` trigger beside an eligible LinkedIn comment composer on the home feed or an individual post page. AI assistance is not implemented yet.

## Requirements

- Node.js 24 LTS
- npm
- Google Chrome or another Chromium browser that can load unpacked extensions

## Development

Install dependencies:

```sh
npm install
```

Start the CRXJS development build:

```sh
npm run dev
```

In Chrome, open `chrome://extensions`, enable **Developer mode**, select **Load unpacked**, and choose the generated `dist` directory. Keep the development command running while editing.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run check
```

`npm run check` runs linting, strict TypeScript checking, the complete test suite, and the production build.

## Production build

```sh
npm run build
```

Load the generated `dist` directory through Chrome's **Load unpacked** option.

## Manual smoke test

Validation records: [Phase 3](docs/testing/phase-3-manual-smoke-test.md), [Phase 4](docs/testing/phase-4-manual-smoke-test.md), [Phase 5](docs/testing/phase-5-manual-smoke-test.md), [Phase 6](docs/testing/phase-6-manual-smoke-test.md), [Phase 7](docs/testing/phase-7-manual-smoke-test.md), [Phase 8](docs/testing/phase-8-manual-smoke-test.md). Selector reference and re-verification snippet: [docs/testing/linkedin-selectors.md](docs/testing/linkedin-selectors.md).

1. Run `npm run check` and confirm it succeeds.
2. Load the generated `dist` directory as an unpacked Chrome extension.
3. Click the modaicom icon and confirm the React popup opens.
4. Open `https://linkedin.com` and confirm the popup shows `LinkedIn detected ✓`.
5. Open `https://www.linkedin.com/feed/`, refresh it, reopen the popup, and confirm detection still succeeds.
6. Open a non-LinkedIn page and confirm the popup shows `Open LinkedIn to use modaicom.`
7. Confirm HTTP LinkedIn URLs, unsupported subdomains such as `learning.linkedin.com`, and lookalike domains such as `linkedin.com.example.com` are not detected.
8. Simulate or encounter an unavailable active-tab URL and confirm the popup shows its error state without crashing; select **Retry** and confirm detection runs again.
9. Open a supported individual LinkedIn post page and confirm the popup shows the author and full authored post text.
10. On `/feed/`, open a post's comment section and confirm its comment composer receives one accessible inline `modaicom` trigger; on a supported individual-post page confirm the always-rendered composer receives one; confirm unrelated editors and reply composers receive none.
11. Click the inline trigger and confirm the editor is not focused, read, or changed; reopen the popup and confirm the selected context or fixed failure copy appears.
12. Confirm SPA route changes and editor rerenders remove orphaned triggers and unsupported routes contain no modaicom controls.
13. Confirm a collapsed post shows the exact guidance to expand “see more” manually, then select **Retry** on an individual-post popup fallback.
14. Confirm media-only, shared-only, ambiguous, missing-author, and missing-post-text cases fail clearly without mutating LinkedIn.

## Architecture

The current dependency direction is deliberately small:

```text
LinkedIn content script ──► service worker relay ──► React popup
          │                         │
          └── exact-root context extraction
```

The content script performs structural editor/post reconciliation and handles explicit inline clicks. The service worker validates versioned messages and owns the five-minute tab-keyed `chrome.storage.session` relay. The popup owns presentation and retains the existing individual-post on-demand fallback.

Future phases may introduce targeted comment/reply extraction, a prompt engine, LLM adapters, and storage beyond the bounded session relay. Those capabilities remain documented rather than implemented before their requirements exist.

## Privacy and control

Phase 3 uses exact LinkedIn host permissions and a static `document_idle` content script so an inline `modaicom` trigger can appear beside eligible comment composers while the popup is closed. Before an explicit click, the content script inspects only structural information needed to identify composers and owning posts; it does not read authored post/comment text or editor values. After a click, only the selected post’s typed plain context or failure is relayed through the service worker’s five-minute `chrome.storage.session` handoff. The popup’s individual-post fallback asks the same content script to extract, so the only permissions are `activeTab` and `storage`. No URLs, HTML, editor text, raw exceptions, analytics, logging, network transmission, or long-term persistence are used. Extraction remains read-only: modaicom never clicks “see more,” inserts text, or publishes a comment or reply.

LinkedIn currently serves two markup regimes and both are recognised: the legacy `article` / `.feed-shared-update-v2` structure on individual `/posts/...` pages, and the newer server-driven UI on the home `/feed/` (obfuscated classes, no activity URN, `[data-testid="mainFeed"]` list items, a lazily mounted comment composer). An unrecognised feed fails closed. See [ADR-0005](docs/adr/0005-linkedin-markup-regimes.md); the popup's extraction transport is [ADR-0004](docs/adr/0004-popup-extraction-via-content-script.md). Selectors and a re-verification snippet live in [docs/testing/linkedin-selectors.md](docs/testing/linkedin-selectors.md).

**AI drafting (Phase 5)** changes one thing: when you click **Generate** in the popup, the authored text you selected — the LinkedIn post, plus the comment for a reply — is sent to *your* configured AI provider using *your own* API key. modaicom runs no server. It sends **only** that authored text and the interaction kind; it never sends author names, headlines, any URL, the activity identifier, the page, your draft, cookies, or account identifiers. You consent once per provider on the options page before anything is transmitted, and every generation is a deliberate click. The key is stored in `chrome.storage.local` only (never synced), read only by the service worker, and never enters a runtime message, the content script, or the LinkedIn page. Drafts are shown for you to copy — nothing is inserted or posted. This deliberately supersedes the earlier no-transmission guarantee; see [ADR-0007](docs/adr/0007-linkedin-content-transmission-and-byok-boundary.md) and [ADR-0008](docs/adr/0008-ai-provider-network-and-key-storage-boundary.md).

## Status

Implemented scope: Phase 0 Foundation, Phase 1 LinkedIn Detection, Phase 2 Primary Post context extraction, Phase 3 inline Feed-Post Targeting, Phase 4 Targeted Comment/Reply Extraction, and **Phase 5 AI Provider Foundation** — a provider-neutral `AIProvider` interface with one reference implementation (OpenAI, Chat Completions, `baseUrl`-parameterised for the compatible ecosystem), BYOK configuration on an options page, a `chrome.storage.local` key never touched by the content script, a service-worker-only network path, a strictly minimised `GenerationRequest`, recorded transmission consent, and a typed `GenerationError` union. The inline-trigger architecture is ADR-0003; ADR-0004/0005/0006 cover extraction transport, markup regimes, and the comment-reply shape; ADR-0007/0008 cover LinkedIn-content transmission and the provider security boundary. Out of scope in Phase 5: tone/intent/length controls, multiple suggestions, editor insertion, automatic posting, local AI, any backend.

## License

[MIT](LICENSE)
