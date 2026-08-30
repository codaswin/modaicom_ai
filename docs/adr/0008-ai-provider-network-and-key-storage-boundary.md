# AI provider network and API-key storage boundary

Status: accepted on 2026-08-30 (grill-with-docs). Companion to ADR-0007.

Phase 5 adds a network caller and a stored credential to an extension that
previously had neither. This ADR records the security boundary.

## The service worker is the sole network caller and key holder

- **Every provider request is made by the service worker.** The popup opens a
  long-lived Port (`chrome.runtime.connect({ name: 'modaicom.generation' })`),
  sends a **keyless** `REQUEST_GENERATION` (carrying only a Generation Request),
  and displays what comes back. The SW reads the key from storage, checks consent
  (ADR-0007), `fetch`es with a composed `AbortController`, and posts a typed
  result over the Port.
- The **content script has no generation code path and never reads the key.** It
  *can* technically call `chrome.storage.local`, so this is enforced structurally:
  the `keyStore` module is imported only by the service worker (read) and the
  options page (write), and a test asserts the built content-script bundle
  contains no reference to it or the key's storage name.
- **LinkedIn page JavaScript can reach neither the key nor the plaintext request**
  — web pages have no `chrome.*` access, and the request never enters the page or
  the content script's world.
- Binding the request to the Port's lifetime (popup closes ⇒ `port.onDisconnect`
  ⇒ `AbortController.abort()` ⇒ `generation-cancelled`) means a provider response
  never needs to be stored: the Generated Draft's only home is the open popup.

## Key storage

- **`chrome.storage.local` only. Never `chrome.storage.sync`.** Syncing a bearer
  credential would replicate it to Google infrastructure and every device the
  user signs into.
- Key `modaicom.provider.<providerId>.apiKey`. **Written directly by the options
  page** (an extension page with the same storage access as the SW), so the key
  never enters a runtime message. Read solely by the SW.
- Accepted residual risk: **`chrome.storage.local` is not encrypted at rest** —
  Chrome stores it as plaintext LevelDB. Anything with profile-directory read
  access (malware, a shared machine, forensics) can read the key. This is inherent
  to BYOK browser extensions. Mitigation is disclosure plus advice: use a scoped
  provider key with a spend cap, and revoke it if the machine is compromised. A
  session passphrase was rejected (heavy UX; the passphrase has the same
  at-rest problem unless re-entered every session).
- Accepted residual risk: a **malicious extension the user installed** with
  `webRequest` + the provider host permission could observe the `Authorization`
  header on the wire. modaicom cannot prevent this.
- The popup never reads the key back. The options UI is write-only:
  configured / Replace / Remove, never the value.

## Least-privilege permissions

- `optional_host_permissions: ['https://api.openai.com/*']`, requested at runtime
  via `chrome.permissions.request()` from the options-page Save gesture. Users who
  never configure AI hold zero provider access; the Phase 5 update disables
  nobody.
- **No `<all_urls>`, no wildcard, no hosts pre-declared for unimplemented
  providers.** Each compatible-provider host is added and requested when that
  provider is configured.
- No `permissions` additions (`storage` already covers `chrome.storage.local`);
  no `scripting`, `tabs`, `webRequest`, `alarms`, `offscreen`.
- **No CSP change.** The popup and options page never `fetch` a provider; the SW
  is not governed by the extension-pages `connect-src`.

## Errors and logging

Provider failures are mapped to the provider-independent **Generation Error**
union before leaving the provider module. Raw exceptions, HTTP status text, and
response bodies are never surfaced to the UI and never logged. A DEV-build
`console.warn({ kind })` — kind only — is the only permitted breadcrumb.
