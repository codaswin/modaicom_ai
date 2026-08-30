import { describe, expect, it } from 'vitest'

import { REQUEST_PAGE_EXTRACTION, isRequestPageExtractionMessage } from './protocol'

describe('isRequestPageExtractionMessage', () => {
  it('accepts the canonical envelope', () => {
    expect(isRequestPageExtractionMessage(REQUEST_PAGE_EXTRACTION)).toBe(true)
    expect(isRequestPageExtractionMessage({ version: 2, type: 'REQUEST_PAGE_EXTRACTION' })).toBe(true)
  })

  it.each([
    undefined,
    null,
    'REQUEST_PAGE_EXTRACTION',
    {},
    { type: 'REQUEST_PAGE_EXTRACTION' },
    { version: 1, type: 'REQUEST_PAGE_EXTRACTION' },
    { version: 2, type: 'GET_LATEST_RELAY' },
    { version: '1', type: 'REQUEST_PAGE_EXTRACTION' },
  ])('rejects malformed value %j', (value) => {
    expect(isRequestPageExtractionMessage(value)).toBe(false)
  })
})
