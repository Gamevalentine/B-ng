// 3B: deterministic no-cost Gemini TTS contract tests. No call to Google or audio hardware.
import assert from 'node:assert/strict'
import { BONG_GEMINI_TTS_MODEL, generateGeminiBongWav, pcmToWav } from '../src/lib/bong-gemini-tts.ts'

assert.equal(BONG_GEMINI_TTS_MODEL, 'gemini-3.1-flash-tts-preview')
const pcm = new Uint8Array([0, 0, 17, 0, 0, 0, 255, 127])
const wav = pcmToWav(pcm)
assert.equal(String.fromCharCode(...wav.slice(0, 4)), 'RIFF')
assert.equal(String.fromCharCode(...wav.slice(8, 12)), 'WAVE')
assert.equal(new DataView(wav.buffer).getUint32(24, true), 24000)
assert.equal(wav.length, pcm.length + 44)
assert.deepEqual([...wav.slice(44)], [...pcm])

let requestCount = 0
const mockFetch = async (url, init) => {
  requestCount++
  assert.ok(url.endsWith('gemini-3.1-flash-tts-preview:generateContent'))
  assert.equal(init.headers['x-goog-api-key'], 'never-real-test-key')
  assert.ok(!url.includes('never-real-test-key'))
  const body = JSON.parse(init.body)
  assert.deepEqual(body.generationConfig.responseModalities, ['AUDIO'])
  assert.equal(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Leda')
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: {
    data: Buffer.from(pcm).toString('base64'),
    mimeType: 'audio/l16; rate=24000; channels=1',
  } }] } }] }), { status: 200 })
}
const output = await generateGeminiBongWav({ text: 'Xin chào, mình là Bông!', key: 'never-real-test-key', fetchImpl: mockFetch })
assert.equal(requestCount, 1)
assert.equal(output.length, pcm.length + 44)
assert.deepEqual([...output.slice(44)], [...pcm])
await assert.rejects(generateGeminiBongWav({ text: 'Chào', key: '', fetchImpl: mockFetch }), /API key/i)
assert.equal(requestCount, 1)
await assert.rejects(generateGeminiBongWav({ text: 'Chào', key: 'test', voice: '../Kore', fetchImpl: mockFetch }), /không hợp lệ/i)
assert.equal(requestCount, 1)
let overQuota = 0
await assert.rejects(generateGeminiBongWav({
  text: 'Chào', key: 'test', fetchImpl: async () => { overQuota++; return new Response('{}', { status: 429 }) },
}), /hạn mức/i)
assert.equal(overQuota, 1, 'Quota errors must not retry or fall back to paid providers')
console.log('PASS: BÔNG opt-in Vietnamese TTS PCM/WAV, key protection, selected youthful voice and no quota retries')
