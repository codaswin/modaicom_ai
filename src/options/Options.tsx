import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { PROVIDER_PRESETS } from '../features/generation/providers/registry'
import type { ModelInfo } from '../features/generation/types'
import { GENERATION_PROTOCOL_VERSION, type ConnectionTestResult } from '../shared/protocol'
import {
  clearApiKey,
  clearConsent,
  readApiKey,
  readModel,
  readModelsCache,
  readSetupSummary,
  writeActiveProviderId,
  writeApiKey,
  writeConsent,
  writeModel,
  writeModelsCache,
  type SetupSummary,
} from '../background/keyStore'
import './options.css'

type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; message: string }
type TestState = { kind: 'idle' } | { kind: 'testing' } | { kind: 'error'; message: string }
type ModelSource = 'live' | 'fallback' | 'cache' | null

async function ensureHostPermission(origin: string): Promise<boolean> {
  try {
    if (await chrome.permissions.contains({ origins: [origin] })) return true
    return await chrome.permissions.request({ origins: [origin] })
  } catch {
    return false
  }
}

function testFailureMessage(kind: unknown, providerLabel: string): string {
  switch (kind) {
    case 'authentication-failed':
      return "This API key isn't valid for the selected provider. Check your provider or API key."
    case 'rate-limited':
      return `${providerLabel} is rate-limiting requests right now. Wait a moment and try again.`
    case 'network-error':
      return `Couldn't reach ${providerLabel}. Check your connection and try again.`
    case 'request-timeout':
      return 'The check timed out. Try again.'
    case 'provider-error':
      return `${providerLabel} returned an error. Try again.`
    default:
      return `${providerLabel} could not be reached. Try again.`
  }
}

export function Options() {
  const presets = PROVIDER_PRESETS
  const [summary, setSummary] = useState<SetupSummary | null>(null)
  const [providerId, setProviderId] = useState(presets[0]!.id)
  const [keyDraft, setKeyDraft] = useState('')
  const [keyTouched, setKeyTouched] = useState(false)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [modelSource, setModelSource] = useState<ModelSource>(null)
  const [model, setModel] = useState('')
  const [manualMode, setManualMode] = useState(false)
  const [manualDraft, setManualDraft] = useState('')
  const [consent, setConsent] = useState(false)
  const [connected, setConnected] = useState(false)
  const [test, setTest] = useState<TestState>({ kind: 'idle' })
  const [save, setSave] = useState<SaveState>({ kind: 'idle' })

  // Tracks the currently-selected provider for in-flight async guards (a Test
  // reply must not land on a provider the user has since switched away from).
  const providerIdRef = useRef(providerId)
  useEffect(() => {
    providerIdRef.current = providerId
  }, [providerId])

  const preset = useMemo(() => presets.find((p) => p.id === providerId) ?? presets[0]!, [presets, providerId])
  const storedKey = summary?.providers[providerId]?.hasKey ?? false
  const effectiveModel = manualMode ? manualDraft.trim() : model
  const canTest = test.kind !== 'testing' && Boolean(keyDraft.trim() || storedKey)
  const canSave =
    save.kind !== 'saving' &&
    Boolean(effectiveModel) &&
    consent &&
    (connected || (!keyTouched && storedKey))

  const loadProvider = useCallback(async (id: string, nextSummary: SetupSummary) => {
    setKeyDraft('')
    setKeyTouched(false)
    setConnected(false)
    setTest({ kind: 'idle' })
    setSave({ kind: 'idle' })
    setManualMode(false)
    setManualDraft('')
    setConsent(nextSummary.providers[id]?.hasConsent ?? false)
    const storedModel = await readModel(id)
    setModel(storedModel ?? '')
    const cache = await readModelsCache(id)
    if (cache && cache.length > 0) {
      setModels(cache)
      setModelSource('cache')
    } else {
      setModels([])
      setModelSource(null)
    }
  }, [])

  const init = useCallback(async () => {
    const s = await readSetupSummary()
    setSummary(s)
    const id = presets.some((p) => p.id === s.active.providerId) ? s.active.providerId : presets[0]!.id
    setProviderId(id)
    await loadProvider(id, s)
  }, [presets, loadProvider])

  useEffect(() => {
    void Promise.resolve().then(init)
  }, [init])

  const onProviderChange = useCallback(
    (id: string) => {
      setProviderId(id)
      if (summary) void loadProvider(id, summary)
    },
    [summary, loadProvider],
  )

  const onTest = useCallback(async () => {
    setTest({ kind: 'testing' })
    if (!(await ensureHostPermission(preset.host))) {
      setTest({ kind: 'error', message: `Access to ${preset.label} was not granted.` })
      return
    }
    const apiKey = keyDraft.trim() || (await readApiKey(providerId)) || ''
    if (!apiKey) {
      setTest({ kind: 'error', message: 'Enter an API key first.' })
      return
    }
    const testedProviderId = providerId
    let reply: ConnectionTestResult
    try {
      reply = (await chrome.runtime.sendMessage({
        v: GENERATION_PROTOCOL_VERSION,
        type: 'TEST_AND_LIST',
        providerId: testedProviderId,
        apiKey,
      })) as ConnectionTestResult
    } catch {
      if (testedProviderId === providerIdRef.current) {
        setTest({ kind: 'error', message: testFailureMessage('network-error', preset.label) })
      }
      return
    }
    // The user may have switched providers while the reply was in flight — a
    // stale result must not land on the now-selected provider.
    if (testedProviderId !== providerIdRef.current) return
    if (reply?.ok) {
      setModels(reply.models)
      setModelSource(reply.modelSource)
      void writeModelsCache(providerId, reply.models)
      setConnected(true)
      setTest({ kind: 'idle' })
      setManualMode(false)
      if (!model || !reply.models.some((m) => m.id === model)) {
        setModel(reply.models[0]?.id ?? model)
      }
    } else {
      setConnected(false)
      setTest({ kind: 'error', message: testFailureMessage(reply?.error?.kind, preset.label) })
    }
  }, [preset, keyDraft, providerId, model])

  const onSave = useCallback(async () => {
    setSave({ kind: 'saving' })
    if (!(await ensureHostPermission(preset.host))) {
      setSave({ kind: 'error', message: `Access to ${preset.label} was not granted. Generation needs it.` })
      return
    }
    if (!effectiveModel) {
      setSave({ kind: 'error', message: 'Choose a model first.' })
      return
    }
    try {
      if (keyTouched && keyDraft.trim()) await writeApiKey(providerId, keyDraft.trim())
      await writeActiveProviderId(providerId)
      await writeModel(providerId, effectiveModel)
      if (consent) await writeConsent(providerId)
      setKeyDraft('')
      setKeyTouched(false)
      setModel(effectiveModel)
      setSave({ kind: 'saved' })
      setSummary(await readSetupSummary())
    } catch {
      setSave({ kind: 'error', message: 'Could not save settings.' })
    }
  }, [preset, effectiveModel, keyTouched, keyDraft, providerId, consent])

  const onRemoveKey = useCallback(async () => {
    // Removing the credential also withdraws the transmission consent tied to it
    // — a later key must earn a fresh, informed consent (ADR-0007 / ADR-0012).
    await clearApiKey(providerId)
    await clearConsent(providerId)
    setConnected(false)
    setConsent(false)
    setTest({ kind: 'idle' })
    setSummary(await readSetupSummary())
  }, [providerId])

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
          <select value={providerId} onChange={(event) => onProviderChange(event.target.value)}>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <label className="options__field">
          <span>API key</span>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={storedKey ? '•••••••••• (key saved ✓)' : 'Paste your API key'}
            value={keyDraft}
            onChange={(event) => {
              setKeyDraft(event.target.value)
              setKeyTouched(true)
              setConnected(false)
            }}
          />
        </label>
        {storedKey ? (
          <button type="button" className="options__link" onClick={() => void onRemoveKey()}>
            Remove stored key
          </button>
        ) : null}

        <div className="options__actions">
          <button type="button" onClick={() => void onTest()} disabled={!canTest}>
            {test.kind === 'testing' ? 'Testing…' : 'Test connection'}
          </button>
          {connected ? (
            <span className="options__ok" role="status">
              Connected ✓
            </span>
          ) : null}
        </div>
        {test.kind === 'error' && (
          <p className="options__err" role="alert">
            {test.message}
          </p>
        )}

        <label className="options__field">
          <span>Model</span>
          <select
            value={models.some((m) => m.id === model) ? model : ''}
            disabled={manualMode || models.length === 0}
            onChange={(event) => setModel(event.target.value)}
          >
            <option value="" disabled>
              {models.length === 0 ? 'Test the connection to load models' : 'Select a model'}
            </option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label ? `${m.label} — ${m.id}` : m.id}
              </option>
            ))}
          </select>
        </label>
        {modelSource === 'fallback' && (
          <p className="options__note">Showing known options — {preset.label}’s live model list couldn’t be loaded.</p>
        )}
        {modelSource === 'cache' && (
          <p className="options__note">Showing your last-seen models. Test the connection to refresh the list.</p>
        )}

        <label className="options__consent">
          <input
            type="checkbox"
            checked={manualMode}
            onChange={(event) => {
              setManualMode(event.target.checked)
              if (event.target.checked) setManualDraft(model)
            }}
          />
          <span>Enter a model ID manually</span>
        </label>
        {manualMode && (
          <label className="options__field">
            <span>Model ID</span>
            <input
              type="text"
              spellCheck={false}
              placeholder="exact model id"
              value={manualDraft}
              onChange={(event) => setManualDraft(event.target.value)}
            />
          </label>
        )}
      </section>

      <section className="options__section">
        <h2>Sending LinkedIn text to {preset.label}</h2>
        <p className="options__note">
          To draft a reply, modaicom sends the LinkedIn <strong>post text</strong> — and, for a reply, the
          <strong> comment text</strong> — that you explicitly select, along with the <strong>tone, intent and
          length</strong> you chose, to <strong>{preset.label}</strong>, using your own API key. The post and comment
          text is written by other people; {preset.label}’s terms and retention policy govern it.
        </p>
        <p className="options__note">
          modaicom does <strong>not</strong> send author names, profiles, any URL, the LinkedIn page, your draft,
          cookies, or account identifiers. Each generation uses your {preset.label} credits.
        </p>
        <label className="options__consent">
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
          <span>I understand and consent to modaicom sending the LinkedIn text I select to {preset.label}.</span>
        </label>
      </section>

      <div className="options__actions">
        <button type="button" onClick={() => void onSave()} disabled={!canSave}>
          Save
        </button>
      </div>

      {save.kind === 'saved' && (
        <p className="options__ok" role="status">
          Settings saved.
        </p>
      )}
      {save.kind === 'error' && (
        <p className="options__err" role="alert">
          {save.message}
        </p>
      )}

      <section className="options__section options__status">
        <h2>Current status</h2>
        <ul>
          <li>Provider: {preset.label}</li>
          <li>Key saved: {storedKey ? 'yes' : 'no'}</li>
          <li>Model: {summary?.active.providerId === providerId ? summary.active.model ?? '—' : '—'}</li>
          <li>Transmission consented: {summary?.providers[providerId]?.hasConsent ? 'yes' : 'no'}</li>
        </ul>
      </section>
    </main>
  )
}
