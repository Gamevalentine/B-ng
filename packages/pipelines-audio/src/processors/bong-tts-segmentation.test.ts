import { describe, expect, it } from 'vitest'

import { chunkTtsInput } from './tts-chunker'

// Documents the B3 diagnosis without changing production speech behavior.
// The existing chunker treats punctuation as a hard boundary even with a
// higher minimumWords threshold. Do not confuse this baseline test with
// successful Mai Chi voice-quality acceptance.
describe('BÔNG Mai Chi segmentation baseline', () => {
  it('currently flushes a short Vietnamese sentence at hard punctuation', async () => {
    const chunks = []
    for await (const chunk of chunkTtsInput(
      'Chào anh! Em là Bông đây. Hôm nay anh có vui không?',
      { boost: 0, minimumWords: 12, maximumWords: 36 },
    ))
      chunks.push(chunk)

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[0].text).toContain('Chào anh')
  })
})
