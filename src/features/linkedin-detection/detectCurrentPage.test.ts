import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { detectCurrentPage } from './detectCurrentPage'

const query = vi.fn()

describe('detectCurrentPage', () => {
  beforeEach(() => {
    query.mockReset()
    vi.stubGlobal('chrome', { tabs: { query } })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('detects a Supported LinkedIn Page on linkedin.com', async () => {
    query.mockResolvedValue([{ url: 'https://linkedin.com' }])

    await expect(detectCurrentPage()).resolves.toEqual({ kind: 'linkedin' })
  })

  it('detects a Supported LinkedIn Page on www.linkedin.com', async () => {
    query.mockResolvedValue([{ url: 'https://www.linkedin.com/feed/?refresh=true#updates' }])

    await expect(detectCurrentPage()).resolves.toEqual({ kind: 'linkedin' })
  })

  it.each([
    'http://linkedin.com',
    'https://learning.linkedin.com',
    'https://linkedin.com.example.com',
    'https://example.com',
  ])('classifies %s as another page', async (url) => {
    query.mockResolvedValue([{ url }])

    await expect(detectCurrentPage()).resolves.toEqual({ kind: 'other' })
  })

  it('returns an error when Chrome returns no active tab', async () => {
    query.mockResolvedValue([])

    await expect(detectCurrentPage()).resolves.toEqual({ kind: 'error' })
  })

  it('returns an error when the active tab has no URL', async () => {
    query.mockResolvedValue([{}])

    await expect(detectCurrentPage()).resolves.toEqual({ kind: 'error' })
  })

  it('returns an error without logging a malformed active-tab URL', async () => {
    const malformedUrl = 'private active tab value'
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    query.mockResolvedValue([{ url: malformedUrl }])

    await expect(detectCurrentPage()).resolves.toEqual({ kind: 'error' })
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(malformedUrl)
  })

  it('returns an error when Chrome cannot query the active tab', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    query.mockRejectedValue(new Error('Tabs API unavailable'))

    await expect(detectCurrentPage()).resolves.toEqual({ kind: 'error' })
  })
})
