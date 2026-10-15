// BÔNG 3C waveform-based lip sync tests (no Gemini, mic or audio hardware).
import assert from 'node:assert/strict'
import { pcmToWav } from '../src/lib/bong-gemini-tts.ts'
import { approximateBrowserMouth, extractBongWavEnvelope, sampleBongMouthOpen } from '../src/lib/bong-lipsync.ts'

const rate = 24000
const samplesPerFrame = 960 // 40 ms
const pcm = new Uint8Array(samplesPerFrame * 2 * 3)
const view = new DataView(pcm.buffer)
for (let i = 0; i < samplesPerFrame; i++)
  view.setInt16(i * 2, 0, true) // silence
for (let i = samplesPerFrame; i < samplesPerFrame * 2; i++)
  view.setInt16(i * 2, Math.round(12000 * Math.sin(2 * Math.PI * 250 * i / rate)), true)
for (let i = samplesPerFrame * 2; i < samplesPerFrame * 3; i++)
  view.setInt16(i * 2, 0, true)

const env = extractBongWavEnvelope(pcmToWav(pcm), 40)
assert.equal(env.levels.length, 3)
assert.equal(env.intervalSeconds, 0.04)
assert.equal(sampleBongMouthOpen(env, 0.005), 0, 'Silence keeps mouth shut')
assert.ok(sampleBongMouthOpen(env, 0.055) > 0.3, 'Voiced audio opens mouth')
assert.equal(sampleBongMouthOpen(env, 0.095), 0, 'Silence after speech closes mouth')
assert.equal(sampleBongMouthOpen(env, 0.125), 0, 'After audio finishes mouth closes')
assert.equal(sampleBongMouthOpen(env, -1), 0)
assert.equal(sampleBongMouthOpen(env, NaN), 0)
assert.throws(() => extractBongWavEnvelope(new Uint8Array([1, 2, 3])), /WAV/)
assert.throws(() => extractBongWavEnvelope(new Uint8Array(48)), /WAV/)
assert.ok(approximateBrowserMouth(1000, 1000) >= 0.2)
assert.ok(approximateBrowserMouth(1050, 1000) <= 0.54)
console.log('PASS: BÔNG Live2D mouth opens on voiced Gemini audio and stays closed for silence/stops')
