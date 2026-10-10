import { describe, expect, it } from 'vitest'
import { normalizeBongWakePhrase } from './bong-transcript'

describe('BÔNG Vietnamese wake phrase correction', () => {
  it('corrects recognized wake phrases at the start of complete utterances', () => {
    expect(normalizeBongWakePhrase('BOK YI hôm nay thời tiết thế nào')).toBe('BÔNG ơi hôm nay thời tiết thế nào')
    expect(normalizeBongWakePhrase('bong oi, em có nghe rõ không')).toBe('BÔNG ơi, em có nghe rõ không')
    expect(normalizeBongWakePhrase('bông i!')).toBe('BÔNG ơi!')
    expect(normalizeBongWakePhrase('  BONG YI  anh ơi')).toBe('  BÔNG ơi  anh ơi')
  })
  it('does not rewrite other speech or guessed names', () => {
    expect(normalizeBongWakePhrase('ông nghe thấy anh nói không')).toBe('ông nghe thấy anh nói không')
    expect(normalizeBongWakePhrase('ONG')).toBe('ONG')
    expect(normalizeBongWakePhrase('anh hỏi bông ơi có khỏe không')).toBe('anh hỏi bông ơi có khỏe không')
    expect(normalizeBongWakePhrase('bong bóng bay')).toBe('bong bóng bay')
    expect(normalizeBongWakePhrase('bong oi là câu ví dụ')).toBe('BÔNG ơi là câu ví dụ')
  })
  it('does not alter generic Vietnamese text', () => {
    expect(normalizeBongWakePhrase('thế hôm nay thời tiết thế nào')).toBe('thế hôm nay thời tiết thế nào')
    expect(normalizeBongWakePhrase('')).toBe('')
  })
})
