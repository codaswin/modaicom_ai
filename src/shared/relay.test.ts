import { describe, expect, it } from 'vitest'

import {
  isRelayMessage,
  isSessionRelayRecord,
  relayKey,
} from './relay'

describe('session relay contract', () => {
  it('validates versioned extraction messages and rejects malformed payloads', () => {
    const result = { kind: 'no-text' as const }
    expect(isRelayMessage({ version: 1, type: 'INLINE_EXTRACTION_RESULT', generation: 2, sessionId: 'session-a', result })).toBe(true)
    expect(isRelayMessage({ version: 2, type: 'INLINE_EXTRACTION_RESULT', generation: 2, sessionId: 'session-a', result })).toBe(false)
    expect(isRelayMessage({ version: 1, type: 'INLINE_EXTRACTION_RESULT', generation: 2, sessionId: 'session-a', result: { kind: 'bad' } })).toBe(false)
    expect(isRelayMessage({ version: 1, type: 'UNKNOWN' })).toBe(false)
  })

  it('validates tab-scoped relay records and keys', () => {
    expect(relayKey(42)).toBe('modaicom.relay.42')
    expect(isSessionRelayRecord({ version: 1, result: { kind: 'cancelled' }, createdAt: 10, expiresAt: 20, generation: 1 })).toBe(true)
    expect(isSessionRelayRecord({ version: 1, result: { kind: 'cancelled' }, createdAt: 10, expiresAt: 10, generation: 1 })).toBe(false)
  })
})
