import { describe, expect, it } from 'vitest'
import { parseMaiChiRequest } from './bong-zero-tts'

describe('BÔNG Mai Chi offline TTS request', () => {
  it('accepts a Vietnamese text and removes newlines', () => {
    expect(parseMaiChiRequest({
      model: 'zerotts-maichi',
      voice: 'vi-VN-maichi',
      input: 'Chào anh!\nEm là BÔNG.',
    })).toBe('Chào anh! Em là BÔNG.')
  })
  it('rejects incorrect model or voice', () => {
    expect(() => parseMaiChiRequest({ model: 'piper-vais1000-medium', voice: 'vi-VN-maichi', input: 'abc' })).toThrow()
    expect(() => parseMaiChiRequest({ model: 'zerotts-maichi', voice: 'other', input: 'abc' })).toThrow()
  })
  it('rejects excessive and empty text', () => {
    expect(() => parseMaiChiRequest({ model: 'zerotts-maichi', voice: 'vi-VN-maichi', input: '' })).toThrow()
    expect(() => parseMaiChiRequest({ model: 'zerotts-maichi', voice: 'vi-VN-maichi', input: 'x'.repeat(901) })).toThrow()
  })
})
