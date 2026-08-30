import { describe, expect, it } from 'vitest'

import {
  GENERATION_PROTOCOL_VERSION,
  REQUEST_PAGE_EXTRACTION,
  isGenerationOneShotMessage,
  isGenerationPortMessage,
  isGenerationResultMessage,
  isRequestPageExtractionMessage,
} from './protocol'

const V = GENERATION_PROTOCOL_VERSION

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

describe('generation protocol guards', () => {
  it('accepts the Port inbound messages', () => {
    expect(isGenerationPortMessage({ v: V, type: 'REQUEST_GENERATION', request: {} })).toBe(true)
    expect(isGenerationPortMessage({ v: V, type: 'CANCEL_GENERATION' })).toBe(true)
  })

  it('accepts the one-shot messages', () => {
    expect(isGenerationOneShotMessage({ v: V, type: 'GET_PROVIDER_STATUS' })).toBe(true)
    expect(isGenerationOneShotMessage({ v: V, type: 'TEST_PROVIDER' })).toBe(true)
    expect(isGenerationOneShotMessage({ v: V, type: 'RECORD_TRANSMISSION_CONSENT', providerId: 'openai' })).toBe(true)
  })

  it('accepts result messages', () => {
    expect(isGenerationResultMessage({ v: V, type: 'GENERATION_RESULT', ok: true, text: 'hi' })).toBe(true)
    expect(isGenerationResultMessage({ v: V, type: 'GENERATION_RESULT', ok: false, error: { kind: 'rate-limited' } })).toBe(true)
  })

  it.each([
    { v: 2, type: 'REQUEST_GENERATION', request: {} },
    { v: V, type: 'REQUEST_GENERATION' },
    { v: V, type: 'GET_LATEST_RELAY' },
    { v: V, type: 'RECORD_TRANSMISSION_CONSENT' },
    { type: 'CANCEL_GENERATION' },
    null,
  ])('rejects wrong version / shape %j', (value) => {
    expect(isGenerationPortMessage(value)).toBe(false)
    expect(isGenerationOneShotMessage(value)).toBe(false)
  })
})
