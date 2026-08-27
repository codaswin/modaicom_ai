# modaicom

modaicom is an open-source Chrome extension for AI-assisted LinkedIn responses with the user in control. Phase 0 and Phase 1 provide the extension foundation and LinkedIn detection; Phase 2 extracts the Primary Post context from supported individual LinkedIn post pages. AI assistance is not implemented yet.

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

1. Run `npm run check` and confirm it succeeds.
2. Load the generated `dist` directory as an unpacked Chrome extension.
3. Click the modaicom icon and confirm the React popup opens.
4. Open `https://linkedin.com` and confirm the popup shows `LinkedIn detected ✓`.
5. Open `https://www.linkedin.com/feed/`, refresh it, reopen the popup, and confirm detection still succeeds.
6. Open a non-LinkedIn page and confirm the popup shows `Open LinkedIn to use modaicom.`
7. Confirm HTTP LinkedIn URLs, unsupported subdomains such as `learning.linkedin.com`, and lookalike domains such as `linkedin.com.example.com` are not detected.
8. Simulate or encounter an unavailable active-tab URL and confirm the popup shows its error state without crashing; select **Retry** and confirm detection runs again.
9. Open a supported individual LinkedIn post page and confirm the popup shows the author and full authored post text.
10. Confirm feed, profile, search, company, and other unsupported LinkedIn paths show individual-post guidance.
11. Confirm a collapsed post shows the exact guidance to expand “see more” manually, then select **Retry**.
12. Confirm media-only, shared-only, ambiguous, missing-author, and missing-post-text cases fail clearly without mutating the LinkedIn page.

## Architecture

The current dependency direction is deliberately small:

```text
React popup
    ↓
LinkedIn detection + context extraction modules
    ↓
Chrome active-tab access, URL classification, and on-demand scripting
```

The popup owns presentation and transient loading state. The detection module hides Chrome tab access and URL classification. The LinkedIn context adapter hides route recognition, DOM candidate selection, normalization, and typed extraction outcomes behind a separate interface.

Future phases may introduce feed-post targeting, targeted comment/reply extraction, a prompt engine, LLM adapters, and storage. Those capabilities remain documented rather than implemented before their requirements exist.

## Privacy and control

Phase 2 requests Chrome's scripting capability alongside temporary activeTab access so it can inspect the active individual-post page only when the user opens the popup. It makes no network requests, stores or transmits no URL or post content, and uses no telemetry. Extraction is read-only: modaicom never clicks “see more,” modifies the page, inserts text, or publishes a comment or reply.

## Status

Implemented scope includes Phase 0 Foundation, Phase 1 LinkedIn Detection, and Phase 2 Primary Post context extraction. Feed-post targeting, comment/reply extraction, AI generation, editor insertion, and publishing automation remain outside this scope.

## License

[MIT](LICENSE)
