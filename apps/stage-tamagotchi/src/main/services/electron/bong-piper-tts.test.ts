import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ protocol: { handle: vi.fn() } }))
import { parseBongPiperRequest } from './bong-piper-tts'

describe('BÔNG B3 local Piper request guard', () => {
  it('accepts only the installed voice and normalizes line breaks', () => {
    expect(parseBongPiperRequest({
      model: 'piper-vais1000-medium',
      voice: 'vi-VN-vais1000-medium',
      input: 'Chào anh.\nEm là BÔNG.',
    })).toBe('Chào anh. Em là BÔNG.')
  })
  it('rejects unsupported voices and empty texts', () => {
    expect(() => parseBongPiperRequest({ input: 'Hi', model: 'other', voice: 'vi-VN-vais1000-medium' })).toThrow()
    expect(() => parseBongPiperRequest({ input: '', model: 'piper-vais1000-medium', voice: 'vi-VN-vais1000-medium' })).toThrow()
  })
  it('limits very large requests to protect low-resource laptop', () => {
    expect(() => parseBongPiperRequest({ input: 'A'.repeat(901), model: 'piper-vais1000-medium', voice: 'vi-VN-vais1000-medium' })).toThrow()
  })
})
