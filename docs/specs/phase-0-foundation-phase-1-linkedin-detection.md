# Phase 0 Foundation + Phase 1 LinkedIn Detection

Status: Confirmed on 2026-08-27.

This specification is the shared understanding reached by the `grill-with-docs` session. It is the implementation scope for modaicom's first two phases.

## Outcome

Build an open-source Chrome extension named modaicom. The extension opens a React popup and reports whether the active tab is a Supported LinkedIn Page. It performs no AI or LinkedIn content operations in these phases.

Domain language is defined in [`../../CONTEXT.md`](../../CONTEXT.md). The permanent user-publication constraint is recorded in [`../adr/0001-user-controlled-publication.md`](../adr/0001-user-controlled-publication.md).

## Foundation

- Chrome Manifest V3
- TypeScript in strict mode
- React
- Vite with the stable `@crxjs/vite-plugin`
- npm with one committed `package-lock.json`
- Node.js 24 LTS, recorded in `.nvmrc` and `package.json#engines`
- ESLint, Vitest, and React Testing Library
- MIT license attributed to “modaicom contributors”
- A concise README covering prerequisites, development, checks, production build, Chrome's Load unpacked flow, current architecture, and future modules
- Temporary lowercase `m` icons in every size referenced by the manifest

The repository contains code only for current behavior. Content scripts, background logic, LinkedIn context extraction, the prompt engine, LLM adapters, and storage are documented as future modules rather than created as placeholders.

## Modules and seam

The current dependency direction is:

```text
React popup
    ↓
LinkedIn detection module
    ↓
Chrome active-tab access and URL classification
```

The detection module exposes one interface:

```ts
type DetectionResult =
  | { kind: "linkedin" }
  | { kind: "other" }
  | { kind: "error" };

detectCurrentPage(): Promise<DetectionResult>;
```

The module hides tab querying, URL parsing, hostname matching, and exception handling. The popup owns the transient `loading` state.

Use these current source areas:

- `src/popup/`: popup composition and presentation
- `src/features/linkedin-detection/`: detection interface and implementation
- `src/shared/`: only types or utilities used by more than one current module

## Detection behavior

The detection module classifies the active tab against the Supported LinkedIn Page definition in `CONTEXT.md`:

- Both `https://linkedin.com` and `https://www.linkedin.com` match.
- Every path, query, and fragment on those exact HTTPS hosts matches.
- HTTP pages do not match.
- Other LinkedIn subdomains, including `learning.linkedin.com`, do not match.
- Lookalike domains, including `linkedin.com.example.com`, do not match.
- A valid nonmatching URL produces `{ kind: "other" }`.
- A Tabs API exception, no active tab, a missing URL, or malformed URL data produces `{ kind: "error" }`.

Detection runs once whenever the popup mounts. Results are not persisted. Retrying runs a fresh detection in the same popup, and reopening the popup always performs a fresh detection.

## Popup behavior

The popup is compact and accessible. Each state uses text and an icon rather than color alone.

| State | Copy | Action |
| --- | --- | --- |
| Loading | `Checking current page…` | None |
| LinkedIn | `LinkedIn detected ✓` | None |
| Other | `Open LinkedIn to use modaicom.` | None |
| Error | `Unable to detect the current page. Try again.` | `Retry` |

The popup contains the modaicom name and one status panel. It contains no controls for tone, intent, length, generation, insertion, or publication.

## Manifest and privacy

- Manifest name: `modaicom`
- Manifest version: `0.1.0`
- Manifest description: `AI-assisted LinkedIn responses with the user in control.`
- `activeTab` is the only permission.
- The manifest declares the popup and temporary icons.
- It declares no host permissions, content scripts, service worker, storage, scripting, commands, or unrelated capabilities.
- Phase 1 makes no network requests and uses no telemetry.
- The extension never persists browsing data or the active-tab URL.
- Detection failures show fixed user-facing copy.
- Local diagnostic logging may include the underlying exception but never the active-tab URL.

## Verification

Provide these commands:

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run check`, which runs all four checks

Automated tests cover:

- Both supported HTTPS hostnames
- Root URLs and arbitrary paths, queries, and fragments
- HTTP rejection
- Unsupported LinkedIn subdomains
- Lookalike-domain rejection
- Missing, malformed, and inaccessible URLs
- Tabs API rejection and empty results
- Loading, LinkedIn, other, and error popup states
- Retry behavior

Browser end-to-end automation is deferred. The README includes a manual smoke-test checklist that verifies:

1. The production build succeeds.
2. Chrome loads the build output through Load unpacked.
3. Clicking the modaicom icon opens the React popup.
4. Both supported LinkedIn hostnames are detected.
5. Non-LinkedIn, unsupported-subdomain, and lookalike tabs are rejected.
6. Refreshing a LinkedIn page and reopening the popup reruns detection successfully.
7. Detection failures render the error state and Retry works.

GitHub Actions runs `npm ci` and `npm run check` on pushes and pull requests with only `contents: read`. CI performs verification only: it publishes no package or extension artifact and requires no secrets.

## Completion criteria

Phase 0 and Phase 1 are complete only when every automated check passes, the production build can be loaded unpacked in Chrome, every manual smoke test passes, failures are handled without a popup crash, and the repository contains no Phase 2-or-later functionality.

## Explicit non-goals

- LinkedIn post or comment extraction
- Content scripts or background processing
- AI or LLM integration
- Prompt construction or provider adapters
- Persistent storage
- Tone, intent, or length controls
- Suggestion generation or selection
- LinkedIn editor insertion
- Automated or extension-triggered publication
- Chrome Web Store packaging or release automation
- Automated browser end-to-end tests
