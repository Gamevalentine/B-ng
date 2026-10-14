// Browser Web Speech adapter test (never requests microphone access).
import assert from 'node:assert/strict'
import {
  appendSpokenText,
  createVietnameseRecognizer,
  extractVietnameseTranscript,
  resolveVietnameseRecognition,
  voiceRecognitionError,
} from '../src/lib/bong-speech.ts'

class FakeSpeech {
  onstart = null
  onresult = null
  onerror = null
  onend = null
  lang = ''
  continuous = true
  interimResults = false
  maxAlternatives = 99
  start() {}
  stop() {}
  abort() {}
}
assert.equal(resolveVietnameseRecognition({ webkitSpeechRecognition: FakeSpeech }), FakeSpeech)
const fake = createVietnameseRecognizer({ webkitSpeechRecognition: FakeSpeech })
assert.equal(fake.lang, 'vi-VN')
assert.equal(fake.continuous, false)
assert.equal(fake.interimResults, true)
assert.equal(fake.maxAlternatives, 1)
assert.throws(() => createVietnameseRecognizer({}), /chưa hỗ trợ/i)

const output = extractVietnameseTranscript({ results: [
  { isFinal: true, 0: { transcript: 'Xin chào' }, length: 1 },
  { isFinal: false, 0: { transcript: 'Bông ơi' }, length: 1 },
] })
assert.deepEqual(output, { final: 'Xin chào', interim: 'Bông ơi' })
assert.equal(appendSpokenText('Bạn ơi ', ' hôm nay thế nào?'), 'Bạn ơi hôm nay thế nào?')
assert.equal(appendSpokenText('', 'Xin chào'), 'Xin chào')
assert.match(voiceRecognitionError('not-allowed'), /quyền micro/i)
assert.match(voiceRecognitionError('audio-capture'), /micro/i)
assert.match(voiceRecognitionError('network'), /Internet/i)
assert.match(voiceRecognitionError('no-speech'), /chưa nghe/i)
console.log('PASS: BÔNG 3A Vietnamese microphone adapter, transcript, permission and network errors')
