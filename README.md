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

The Phase 3 validation record is maintained in [docs/testing/phase-3-manual-smoke-test.md](docs/testing/phase-3-manual-smoke-test.md).

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

LinkedIn currently serves two markup regimes and both are recognised: the legacy `article` / `.feed-shared-update-v2` structure on individual `/posts/...` pages, and the newer server-driven UI on the home `/feed/` (obfuscated classes, no activity URN, `[data-testid="mainFeed"]` list items, a lazily mounted comment composer). See [ADR-0004](docs/adr/0004-linkedin-sdui-feed-and-content-script-extraction.md).

## Status

Implemented scope includes Phase 0 Foundation, Phase 1 LinkedIn Detection, Phase 2 Primary Post context extraction, and the revised Phase 3 inline Feed-Post Targeting design. The inline-trigger architecture is documented in ADR-0003; the revised inline-trigger slice is implemented. Comment/reply extraction, AI generation, editor insertion, and publishing automation remain outside this scope.

## License

[MIT](LICENSE)
