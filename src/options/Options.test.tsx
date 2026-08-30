import { render, screen } from '@testing-library/react'
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
        remove: vi.fn(async (key: string) => {
          store.delete(key)
        }),
      },
    },
    permissions: { contains: permContains, request: permRequest },
  })
})

afterEach(() => vi.unstubAllGlobals())

describe('Options page', () => {
  it('saves key, model, and consent; writes the key directly to storage (no message)', async () => {
    const user = userEvent.setup()
    render(<Options />)
    await screen.findByText('AI provider (bring your own key)')

    await user.type(screen.getByPlaceholderText('sk-…'), 'sk-live-xyz')
    const modelInput = screen.getByRole('textbox', { name: 'Model' })
    await user.clear(modelInput)
    await user.type(modelInput, 'gpt-4.1-mini')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await screen.findByText('Settings saved.')
    expect(permRequest).toHaveBeenCalledWith({ origins: ['https://api.openai.com/*'] })
    expect(store.get('modaicom.provider.openai.apiKey')).toBe('sk-live-xyz')
    expect(store.get('modaicom.provider.config')).toMatchObject({ providerId: 'openai', model: 'gpt-4.1-mini' })
    expect(store.get('modaicom.provider.consent')).toMatchObject({ providerId: 'openai' })
    // the key was never sent in a runtime message
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ apiKey: expect.anything() }))
  })

  it('surfaces a denied host permission', async () => {
    permRequest.mockResolvedValue(false)
    const user = userEvent.setup()
    render(<Options />)
    await screen.findByText('AI provider (bring your own key)')
    await user.type(screen.getByPlaceholderText('sk-…'), 'sk-live-xyz')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/not granted/)
    expect(store.has('modaicom.provider.openai.apiKey')).toBe(false)
  })

  it('Test key sends TEST_PROVIDER and reports the typed error', async () => {
    store.set('modaicom.provider.config', { providerId: 'openai', model: 'gpt-4o-mini' })
    store.set('modaicom.provider.openai.apiKey', 'sk-live-xyz')
    sendMessage.mockResolvedValue({ ok: false, error: { kind: 'authentication-failed' } })
    const user = userEvent.setup()
    render(<Options />)
    await screen.findByText('AI provider (bring your own key)')
    await user.click(screen.getByRole('button', { name: 'Test key' }))
    expect(sendMessage).toHaveBeenCalledWith({ v: 1, type: 'TEST_PROVIDER' })
    expect(await screen.findByRole('alert')).toHaveTextContent('authentication-failed')
  })
})
