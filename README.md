# modaicom

modaicom is an open-source Chrome extension for AI-assisted LinkedIn responses with the user in control. Phase 0 and Phase 1 provide the extension foundation and detect whether the active tab is a Supported LinkedIn Page; AI assistance is not implemented yet.

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

## Architecture

The current dependency direction is deliberately small:

```text
React popup
    ↓
LinkedIn detection module
    ↓
Chrome active-tab access and URL classification
```

The popup owns presentation and transient loading state. The detection module hides Chrome tab access, URL parsing, exact hostname matching, and failure handling behind one interface.

Future phases may introduce content scripts, background logic, LinkedIn context extraction, a prompt engine, LLM adapters, and storage. Those modules are documented here rather than scaffolded before their requirements exist.

## Privacy and control

Phase 1 requests only Chrome's temporary `activeTab` permission. It makes no network requests, stores no browsing data, and uses no telemetry. modaicom never publishes a comment or reply; only the user may activate LinkedIn's Post or Reply control.

## Status

Implemented scope is limited to Phase 0 Foundation and Phase 1 LinkedIn Detection. Content extraction, AI generation, editor insertion, and publishing automation are outside this phase.

## License

[MIT](LICENSE)
