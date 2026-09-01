<div align="center">
  <img src="assets/icon-source.svg" width="104" height="104" alt="modaicom logo">

  # modaicom

  **Thoughtful LinkedIn replies, minus the blank-page struggle.**

  An open-source Chrome extension that understands the post or comment you choose,
  drafts a response in your voice, and leaves the final word—and the Post button—to you.

  [![Release](https://img.shields.io/badge/release-v1.1.0-5b3fd6?style=flat-square&logo=github&logoColor=white)](https://github.com/codaswin/modaicom_ai/releases/latest)
  [![CI](https://img.shields.io/github/actions/workflow/status/codaswin/modaicom_ai/ci.yml?branch=main&style=flat-square&label=checks)](https://github.com/codaswin/modaicom_ai/actions/workflows/ci.yml)
  [![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?style=flat-square&logo=googlechrome&logoColor=white)](manifest.config.ts)
  [![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white)](tsconfig.json)
  [![License: MIT](https://img.shields.io/badge/License-MIT-22c55e?style=flat-square)](LICENSE)

  [![LinkedIn](https://img.shields.io/badge/LinkedIn-Aswin-0A66C2?style=flat-square&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/aswin-s-1a3026346/)
  [![GitHub](https://img.shields.io/badge/GitHub-codaswin-181717?style=flat-square&logo=github&logoColor=white)](https://github.com/codaswin)

  [Download v1](https://github.com/codaswin/modaicom_ai/releases/latest) ·
  [How it works](#how-it-works) ·
  [Privacy](#privacy-by-design) ·
  [Build from source](#build-from-source)
</div>

---

The name comes from **“modai”**, Tamil for laziness 😄. modaicom removes the tedious part of composing a good LinkedIn response while keeping the human firmly in control.

## How it works

1. Open a supported LinkedIn post or comment composer.
2. Click the small purple **m** beside LinkedIn's editor.
3. Choose a **Tone**, **Intent**, and **Length**.
4. Generate, review, regenerate, copy, or insert the draft.
5. Edit anything you want, then manually click LinkedIn's **Post** or **Reply** button.

> [!IMPORTANT]
> modaicom never publishes, submits, likes, follows, or performs any other LinkedIn action automatically.

## What ships in v1

- Inline targeting for supported top-level comment composers on the LinkedIn home feed and individual post pages.
- Reply targeting for structurally validated comment threads on LinkedIn's supported legacy post markup.
- Read-only extraction of the exact owning post—and the target comment when replying.
- Four tones: **Professional**, **Friendly**, **Confident**, and **Thoughtful**.
- Six intents: **Support**, **Add insight**, **Ask a question**, **Answer**, **Disagree**, and **Congratulate**.
- Three response lengths: **Short**, **Medium**, and **Long**.
- Bring-your-own-key AI integration with a configurable model.
- Copy, regenerate, or insert a draft into the exact empty editor that started the session.
- Protection against overwriting user-written text, stale editors, route changes, and wrong-tab insertion.
- Accessible keyboard-operable controls, typed failures, and fail-closed LinkedIn DOM adapters.

## New in v1.1

- **Multi-provider BYOK.** Choose **OpenAI**, **Anthropic**, **Groq**, **xAI (Grok)**, or **Google Gemini**. One API-key field, one active provider at a time.
- **Dynamic model selection.** **Test connection** validates your key and fetches that provider's live model list; a curated fallback list is used when the catalogue can't be read.
- **Per-provider settings.** API key, model choice, and transmission consent are stored independently for each provider, so switching providers never loses your other configuration.
- Provider behavior stays behind a single provider abstraction—an OpenAI-compatible provider is added as configuration, not new request code.

## Install v1

modaicom is distributed as an unpacked Chrome extension for this first open-source release.

1. Download `modaicom-v1.1.0.zip` from the [latest GitHub release](https://github.com/codaswin/modaicom_ai/releases/latest).
2. Unzip it somewhere permanent.
3. Open `chrome://extensions` in Chrome.
4. Enable **Developer mode**.
5. Click **Load unpacked** and choose the unzipped folder.
6. Pin modaicom from Chrome's Extensions menu.

Chrome does not automatically update unpacked extensions. Download a newer release and replace the folder when upgrading.

## Configure AI drafting

1. Open `chrome://extensions` → **modaicom** → **Details** → **Extension options**.
2. Choose a provider: **OpenAI**, **Anthropic**, **Groq**, **xAI (Grok)**, or **Google Gemini**.
3. Add a scoped API key for that provider, preferably with a spend cap.
4. Read and accept the provider-transmission disclosure.
5. Click **Test connection**. modaicom validates the key and loads the provider's model list.
6. Pick a model and **Save**.

modaicom requests network access only to the API host of the provider you configure, and asks for that host permission at the moment you test the connection. It has no backend and no shared API key—provider usage is billed directly to the key you configure.

## Privacy by design

| Boundary | v1 behavior |
| --- | --- |
| Before you click modaicom | Inspects structural markers only to place the trigger. It does not read authored post, comment, or editor text. |
| After an explicit trigger click | Reads only the validated owning post and, for a supported reply, its target comment. |
| Sent to your AI provider | Post text, optional target-comment text, interaction kind, and your tone/intent/length choices. |
| Never sent | Author names, profiles, URLs, LinkedIn identifiers, page HTML, cookies, account identifiers, or editor contents. |
| API key | Stored in `chrome.storage.local`, never synced, and read only by the background service worker. |
| Extracted context | Relayed through five-minute `chrome.storage.session` records and cleared after consumption or cleanup. |
| Generated drafts | Kept in memory; never logged, analyzed, or persisted by modaicom. |
| Publishing | Always manual. modaicom can insert text, but only you can submit it. |

Your configured provider's terms and retention policy govern content sent for generation. Review the disclosure before enabling AI drafting. The security and consent boundaries are documented in [ADR-0007](docs/adr/0007-linkedin-content-transmission-and-byok-boundary.md), [ADR-0008](docs/adr/0008-ai-provider-network-and-key-storage-boundary.md), and [ADR-0011](docs/adr/0011-editor-insertion-and-inline-trigger-redesign.md).

## Supported LinkedIn surfaces

| Surface | Support |
| --- | --- |
| Home feed: `https://linkedin.com/feed/` and `https://www.linkedin.com/feed/` | Top-level post comment targeting after LinkedIn mounts the comment composer. Dynamically loaded posts are reconciled. |
| Individual `/posts/...` pages | Post comments and supported comment-thread replies. |
| Individual `/feed/update/urn:li:activity:...` pages | Post comments and supported comment-thread replies. |
| Messages, search, post creation, nested/shared posts, unrelated cards | Intentionally unsupported. No trigger is rendered. |
| Unknown or ambiguous LinkedIn markup | Fails closed rather than guessing. |

LinkedIn changes its DOM frequently. The conservative adapter and verified selector regimes are documented in [ADR-0005](docs/adr/0005-linkedin-markup-regimes.md) and [docs/testing/linkedin-selectors.md](docs/testing/linkedin-selectors.md).

## Build from source

Requirements: **Node.js 24 LTS**, npm, and Chrome or another Chromium browser that supports unpacked extensions.

```bash
git clone https://github.com/codaswin/modaicom_ai.git
cd modaicom_ai
npm ci
npm run check
```

Then open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `dist/`.

For development with live rebuilding:

```bash
npm run dev
```

Available checks:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run check
```

## Architecture

```text
LinkedIn page
  └─ exact-host content script
       ├─ structural-only composer reconciliation
       ├─ explicit-click context extraction
       └─ explicit, guarded draft insertion
              │
              ▼
       service worker
       ├─ short-lived session relay
       ├─ consent + provider boundary
       └─ provider request using the user's key
              │
              ▼
       React popup
       ├─ context preview
       ├─ tone / intent / length
       └─ generate / regenerate / copy / insert
```

The project uses Manifest V3, React, TypeScript, Vite, CRXJS, and Vitest. Domain vocabulary lives in [CONTEXT.md](CONTEXT.md); architectural decisions live in [docs/adr](docs/adr); phase specifications and manual validation checklists live under [docs](docs).

## Current validation status

Automated linting, strict TypeScript checks, tests, security bundle assertions, and the production build run in [GitHub Actions](https://github.com/codaswin/modaicom_ai/actions/workflows/ci.yml). LinkedIn is a moving external surface, so real-browser smoke-test records remain explicit under [docs/testing](docs/testing). At the time of this release, those checklists are still marked **Pending validation**; treat v1 as an open-source first release and report DOM compatibility issues with the affected surface only—never include private LinkedIn content.

## Contributing

Issues and pull requests are welcome. Before changing LinkedIn adapters or privacy boundaries:

1. Read [AGENTS.md](AGENTS.md), [CONTEXT.md](CONTEXT.md), and the relevant ADRs.
2. Keep fixtures synthetic and redacted—never commit real LinkedIn HTML or authored content.
3. Preserve fail-closed ownership validation and user-controlled publication.
4. Run `npm run check` before opening a pull request.

Please use [GitHub Issues](https://github.com/codaswin/modaicom_ai/issues) for bugs and feature discussions.

## License

modaicom is open source under the [MIT License](LICENSE).
