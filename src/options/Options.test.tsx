import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Options } from './Options'

const store = new Map<string, unknown>()
const permContains = vi.fn()
const permRequest = vi.fn()
const sendMessage = vi.fn()

beforeEach(() => {
  store.clear()
  permContains.mockResolvedValue(false)
  permRequest.mockResolvedValue(true)
  sendMessage.mockReset()
  vi.stubGlobal('chrome', {
    runtime: { id: 'ext', sendMessage },
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: store.get(key) })),
        set: vi.fn(async (values: Record<string, unknown>) => {
          Object.entries(values).forEach(([k, v]) => store.set(k, v))
        }),
        remove: vi.fn(async (keys: string | string[]) => {
          ;(Array.isArray(keys) ? keys : [keys]).forEach((k) => store.delete(k))
        }),
      },
    },
    permissions: { contains: permContains, request: permRequest },
  })
})

afterEach(() => vi.unstubAllGlobals())

const okReply = (models: { id: string; label?: string }[], modelSource: 'live' | 'fallback' = 'live') => ({
  ok: true,
  models,
  modelSource,
})

async function loaded() {
  render(<Options />)
  await screen.findByText('AI provider (bring your own key)')
}

describe('Options page — provider dropdown', () => {
  it('lists every registered provider', async () => {
    await loaded()
    const select = screen.getByRole('combobox', { name: 'Provider' })
    const names = [...select.querySelectorAll('option')].map((o) => o.textContent)
    expect(names).toEqual(['OpenAI', 'Groq', 'xAI (Grok)', 'Anthropic', 'Google Gemini'])
  })

  it('switching provider requests that provider’s host on Test', async () => {
    const user = userEvent.setup()
    sendMessage.mockResolvedValue(okReply([{ id: 'grok-4' }]))
    await loaded()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Provider' }), 'xai')
    await user.type(screen.getByPlaceholderText('Paste your API key'), 'xai-key')
    await user.click(screen.getByRole('button', { name: 'Test connection' }))
    expect(permRequest).toHaveBeenCalledWith({ origins: ['https://api.x.ai/*'] })
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'TEST_AND_LIST', providerId: 'xai' }))
  })
})

describe('Options page — connection test and model selection', () => {
  it('Test connection requests the host, sends TEST_AND_LIST, and fills the model dropdown', async () => {
    const user = userEvent.setup()
    sendMessage.mockResolvedValue(okReply([{ id: 'gpt-4o-mini', label: 'GPT-4o mini' }, { id: 'gpt-4o' }]))
    await loaded()

    await user.type(screen.getByPlaceholderText('Paste your API key'), 'sk-live-xyz')
    await user.click(screen.getByRole('button', { name: 'Test connection' }))

    expect(permRequest).toHaveBeenCalledWith({ origins: ['https://api.openai.com/*'] })
    expect(sendMessage).toHaveBeenCalledWith({
      v: 3,
      type: 'TEST_AND_LIST',
      providerId: 'openai',
      apiKey: 'sk-live-xyz',
    })
    await screen.findByText('Connected ✓')
    const modelSelect = screen.getByRole('combobox', { name: 'Model' })
    expect(within(modelSelect).getByRole('option', { name: 'GPT-4o mini — gpt-4o-mini' })).toBeInTheDocument()
  })

  it('a 401 shows the provider-neutral mismatch message and does not connect', async () => {
    const user = userEvent.setup()
    sendMessage.mockResolvedValue({ ok: false, error: { kind: 'authentication-failed' } })
    await loaded()
    await user.type(screen.getByPlaceholderText('Paste your API key'), 'wrong-key')
    await user.click(screen.getByRole('button', { name: 'Test connection' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "This API key isn't valid for the selected provider. Check your provider or API key.",
    )
    expect(screen.queryByText('Connected ✓')).not.toBeInTheDocument()
  })

  it('editing the key after a successful test clears "Connected ✓"', async () => {
    const user = userEvent.setup()
    sendMessage.mockResolvedValue(okReply([{ id: 'gpt-4o-mini' }]))
    await loaded()
    await user.type(screen.getByPlaceholderText('Paste your API key'), 'sk-live-xyz')
    await user.click(screen.getByRole('button', { name: 'Test connection' }))
    await screen.findByText('Connected ✓')

    await user.type(screen.getByPlaceholderText('Paste your API key'), 'more')
    expect(screen.queryByText('Connected ✓')).not.toBeInTheDocument()
  })

  it('shows the curated list note when the model source is a fallback', async () => {
    const user = userEvent.setup()
    sendMessage.mockResolvedValue(okReply([{ id: 'gpt-4o-mini' }], 'fallback'))
    await loaded()
    await user.type(screen.getByPlaceholderText('Paste your API key'), 'sk-live-xyz')
    await user.click(screen.getByRole('button', { name: 'Test connection' }))
    expect(await screen.findByText(/Showing known options/)).toBeInTheDocument()
  })
})

describe('Options page — save gating and persistence', () => {
  it('Save is disabled until a test succeeds, then writes per-provider key/model/consent directly to storage', async () => {
    const user = userEvent.setup()
    sendMessage.mockResolvedValue(okReply([{ id: 'gpt-4o-mini' }]))
    await loaded()

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

    await user.type(screen.getByPlaceholderText('Paste your API key'), 'sk-live-xyz')
    await user.click(screen.getByRole('button', { name: 'Test connection' }))
    await screen.findByText('Connected ✓')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Model' }), 'gpt-4o-mini')
    await user.click(screen.getByRole('checkbox', { name: /I understand and consent/ }))

    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Settings saved.')

    expect(store.get('modaicom.provider.openai.apiKey')).toBe('sk-live-xyz')
    expect(store.get('modaicom.provider.active')).toBe('openai')
    expect(store.get('modaicom.provider.openai.model')).toBe('gpt-4o-mini')
    expect(store.get('modaicom.provider.openai.consent')).toMatchObject({ consentedAt: expect.any(Number) })
    // the key was never sent in a runtime message
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'RECORD_TRANSMISSION_CONSENT' }))
  })

  it('a returning user with a stored validated key can change only the model without re-testing', async () => {
    store.set('modaicom.provider.active', 'openai')
    store.set('modaicom.provider.openai.apiKey', 'sk-stored')
    store.set('modaicom.provider.openai.model', 'gpt-4o-mini')
    store.set('modaicom.provider.openai.consent', { consentedAt: 1 })
    const user = userEvent.setup()
    await loaded()

    await user.click(screen.getByRole('checkbox', { name: 'Enter a model ID manually' }))
    const manual = screen.getByRole('textbox', { name: 'Model ID' })
    await user.clear(manual)
    await user.type(manual, 'gpt-4.1-mini')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await screen.findByText('Settings saved.')
    expect(store.get('modaicom.provider.openai.model')).toBe('gpt-4.1-mini')
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('a denied host permission is surfaced and nothing is written', async () => {
    permRequest.mockResolvedValue(false)
    const user = userEvent.setup()
    await loaded()
    await user.type(screen.getByPlaceholderText('Paste your API key'), 'sk-live-xyz')
    await user.click(screen.getByRole('button', { name: 'Test connection' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/not granted/)
    expect(store.has('modaicom.provider.openai.apiKey')).toBe(false)
  })

  it('Remove stored key clears it and re-locks Save', async () => {
    store.set('modaicom.provider.active', 'openai')
    store.set('modaicom.provider.openai.apiKey', 'sk-stored')
    store.set('modaicom.provider.openai.model', 'gpt-4o-mini')
    store.set('modaicom.provider.openai.consent', { consentedAt: 1 })
    const user = userEvent.setup()
    await loaded()
    await user.click(screen.getByRole('button', { name: 'Remove stored key' }))
    await vi.waitFor(() => expect(store.has('modaicom.provider.openai.apiKey')).toBe(false))
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    // consent is withdrawn with the key — a later key must re-consent
    expect(store.has('modaicom.provider.openai.consent')).toBe(false)
    expect(screen.getByRole('checkbox', { name: /I understand and consent/ })).not.toBeChecked()
  })
})

describe('Options page — v1.0.0 migration on load', () => {
  it('migrates the legacy single-provider record so the page reflects it', async () => {
    store.set('modaicom.provider.config', { providerId: 'openai', model: 'gpt-4o-mini' })
    store.set('modaicom.provider.consent', { providerId: 'openai', consentedAt: 111 })
    store.set('modaicom.provider.openai.apiKey', 'sk-legacy')
    await loaded()

    await vi.waitFor(() => expect(store.get('modaicom.provider.active')).toBe('openai'))
    expect(store.get('modaicom.provider.openai.model')).toBe('gpt-4o-mini')
    expect(store.get('modaicom.provider.openai.consent')).toEqual({ consentedAt: 111 })
    expect(store.has('modaicom.provider.config')).toBe(false)
    expect(screen.getByText('Key saved: yes')).toBeInTheDocument()
  })
})
