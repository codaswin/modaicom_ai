import { useCallback, useEffect, useState } from 'react'

import { DEFAULT_MODEL, DEFAULT_PROVIDER_ID } from '../features/generation/providers/registry'
import { isGenerationErrorKind } from '../features/generation/types'
import { GENERATION_PROTOCOL_VERSION } from '../shared/protocol'
import {
  clearApiKey,
  readProviderConfig,
  readProviderStatus,
  writeApiKey,
  writeProviderConfig,
  writeTransmissionConsent,
  type ProviderStatus,
} from '../background/keyStore'
import './options.css'

const PROVIDER_ORIGIN = 'https://api.openai.com/*'
const PROVIDER_ID = DEFAULT_PROVIDER_ID

type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; message: string }
type TestState = { kind: 'idle' } | { kind: 'testing' } | { kind: 'ok' } | { kind: 'error'; message: string }

async function ensureHostPermission(): Promise<boolean> {
  try {
    if (await chrome.permissions.contains({ origins: [PROVIDER_ORIGIN] })) return true
    return await chrome.permissions.request({ origins: [PROVIDER_ORIGIN] })
  } catch {
    return false
  }
}

export function Options() {
  const [status, setStatus] = useState<ProviderStatus | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [baseUrl, setBaseUrl] = useState('')
  const [consent, setConsent] = useState(false)
  const [save, setSave] = useState<SaveState>({ kind: 'idle' })
  const [test, setTest] = useState<TestState>({ kind: 'idle' })

  const refresh = useCallback(async () => {
    const [nextStatus, config] = await Promise.all([readProviderStatus(), readProviderConfig()])
    setStatus(nextStatus)
    if (config) {
      setModel(config.model)
      setBaseUrl(config.baseUrl ?? '')
    }
    setConsent(nextStatus.consented)
  }, [])

  useEffect(() => {
    void Promise.resolve().then(refresh)
  }, [refresh])

  const onSave = useCallback(async () => {
    setSave({ kind: 'saving' })
    if (!(await ensureHostPermission())) {
      setSave({ kind: 'error', message: 'Access to the provider was not granted. Generation needs it.' })
      return
    }
    if (!model.trim()) {
      setSave({ kind: 'error', message: 'A model name is required.' })
      return
    }
    try {
      await writeProviderConfig({
        providerId: PROVIDER_ID,
        model: model.trim(),
        ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
      })
      if (apiKey.trim()) {
        await writeApiKey(PROVIDER_ID, apiKey.trim())
        setApiKey('')
      }
      if (consent) {
        await writeTransmissionConsent(PROVIDER_ID)
      }
      setSave({ kind: 'saved' })
      await refresh()
    } catch {
      setSave({ kind: 'error', message: 'Could not save settings.' })
    }
  }, [apiKey, model, baseUrl, consent, refresh])

  const onRemoveKey = useCallback(async () => {
    await clearApiKey(PROVIDER_ID)
    await refresh()
  }, [refresh])

  const onTest = useCallback(async () => {
    setTest({ kind: 'testing' })
    try {
      const reply: unknown = await chrome.runtime.sendMessage({ v: GENERATION_PROTOCOL_VERSION, type: 'TEST_PROVIDER' })
      if (reply && typeof reply === 'object' && (reply as { ok?: unknown }).ok === true) {
        setTest({ kind: 'ok' })
        return
      }
      const kind = (reply as { error?: { kind?: unknown } } | undefined)?.error?.kind
      setTest({ kind: 'error', message: isGenerationErrorKind(kind) ? kind : 'provider-error' })
    } catch {
      setTest({ kind: 'error', message: 'network-error' })
    }
  }, [])

  return (
    <main className="options">
      <h1>modaicom settings</h1>

      <section className="options__section">
        <h2>AI provider (bring your own key)</h2>
        <p className="options__note">
          modaicom has no server. Your key is stored on this device only (never synced) and is used only by the
          extension’s background worker.
        </p>

        <label className="options__field">
          <span>Provider</span>
          <input type="text" value="OpenAI" readOnly />
        </label>

        <label className="options__field">
          <span>API key</span>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={status?.configured ? '•••••••••• (configured)' : 'sk-…'}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
          />
        </label>
        {status?.configured ? (
          <button type="button" className="options__link" onClick={() => void onRemoveKey()}>Remove stored key</button>
        ) : null}

        <label className="options__field">
          <span>Model</span>
          <input type="text" value={model} onChange={(event) => setModel(event.target.value)} />
        </label>

        <label className="options__field">
          <span>Base URL (optional — for OpenAI-compatible providers)</span>
          <input
            type="text"
            placeholder="https://api.openai.com/v1"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
          />
        </label>
      </section>

      <section className="options__section">
        <h2>Sending LinkedIn text to your provider</h2>
        <p className="options__note">
          To draft a reply, modaicom sends the LinkedIn <strong>post text</strong> — and, for a reply, the
          <strong> comment text</strong> — that you explicitly select, along with the <strong>tone, intent and
          length</strong> you chose, to your configured provider, using your own API key. The post and comment text is
          written by other people; your provider’s terms and retention policy govern it.
        </p>
        <p className="options__note">
          modaicom does <strong>not</strong> send author names, profiles, any URL, the LinkedIn page, your draft,
          cookies, or account identifiers. The tone/intent/length you pick carry no LinkedIn content. Each generation
          uses your provider credits.
        </p>
        <label className="options__consent">
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
          <span>I understand and consent to modaicom sending the LinkedIn text I select to my provider.</span>
        </label>
      </section>

      <div className="options__actions">
        <button type="button" onClick={() => void onSave()} disabled={save.kind === 'saving'}>Save</button>
        <button type="button" onClick={() => void onTest()} disabled={!status?.configured || test.kind === 'testing'}>
          Test key
        </button>
      </div>

      {save.kind === 'saved' && <p className="options__ok" role="status">Settings saved.</p>}
      {save.kind === 'error' && <p className="options__err" role="alert">{save.message}</p>}
      {test.kind === 'ok' && <p className="options__ok" role="status">Provider reachable — key works.</p>}
      {test.kind === 'error' && <p className="options__err" role="alert">Test failed: {test.message}</p>}

      <section className="options__section options__status">
        <h2>Current status</h2>
        <ul>
          <li>Key configured: {status?.configured ? 'yes' : 'no'}</li>
          <li>Model: {status?.model ?? '—'}</li>
          <li>Transmission consented: {status?.consented ? 'yes' : 'no'}</li>
        </ul>
      </section>
    </main>
  )
}
