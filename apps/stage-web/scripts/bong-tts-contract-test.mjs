// Test browser TTS helpers without audio hardware, network, or a voice model.
import assert from 'node:assert/strict'
import {
  BONG_TTS_NOTICE,
  chooseVietnameseVoice,
  clampBongSpeechRate,
  findVietnameseVoices,
  prepareVietnameseSpeech,
} from '../src/lib/bong-tts-browser.ts'

const voices = [
  { name: 'English voice', lang: 'en-US', voiceURI: 'en', localService: true },
  { name: 'Vietnamese online', lang: 'vi-VN', voiceURI: 'vi-online', localService: false },
  { name: 'Vietnamese local', lang: 'vi-VN', voiceURI: 'vi-local', localService: true },
]
assert.deepEqual(findVietnameseVoices(voices).map(x => x.voiceURI), ['vi-local', 'vi-online'])
assert.equal(chooseVietnameseVoice(voices, 'vi-online')?.voiceURI, 'vi-online')
assert.equal(chooseVietnameseVoice(voices, 'missing')?.voiceURI, 'vi-local')
assert.equal(chooseVietnameseVoice([voices[0]], 'en'), undefined)
assert.match(prepareVietnameseSpeech('**Chào bạn!** [Bấm đây](https://example.com) nhé.'), /Chào bạn! Bấm đây nhé/)
assert.ok(!prepareVietnameseSpeech('Đọc ```const apiKey = "secret"``` cho tôi').includes('secret'))
assert.equal(prepareVietnameseSpeech('Xin chào'.repeat(500)).length, 800)
assert.equal(clampBongSpeechRate(0.4), 0.8)
assert.equal(clampBongSpeechRate(2), 1.25)
assert.equal(clampBongSpeechRate(NaN), 1)
assert.match(BONG_TTS_NOTICE, /chưa phải giọng Mai Chi/i)
console.log('PASS: BÔNG 3B browser TTS, Vietnamese voice choice, sanitization, rate and Mai Chi disclaimer')
