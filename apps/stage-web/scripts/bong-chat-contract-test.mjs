// Executed in GitHub Actions only; no external Gemini requests are made.
import assert from 'node:assert/strict'
import { generateBongReply, offlinePreviewReply } from '../src/lib/bong-chat.ts'

assert.match(offlinePreviewReply('xin chào'), /mô phỏng/i)
assert.match(offlinePreviewReply('Hôm nay thế nào?'), /mô phỏng/i)

let captured = null
const fakeFetch = async (url, init) => {
  captured = { url, init }
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: 'Xin chào, mình là BÔNG!' }] } }],
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}

const result = await generateBongReply({
  apiKey: 'test-key-never-real',
  model: 'gemini-2.5-flash-lite',
  history: [{ role: 'user', text: 'Xin chào' }],
  fetchImpl: fakeFetch,
})
assert.equal(result, 'Xin chào, mình là BÔNG!')
assert.equal(captured.init.headers['x-goog-api-key'], 'test-key-never-real')
assert.equal(captured.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent')
assert.ok(!captured.url.includes('test-key-never-real'))
assert.equal(JSON.parse(captured.init.body).contents[0].parts[0].text, 'Xin chào')
assert.equal(captured.init.referrerPolicy, 'no-referrer')

await assert.rejects(
  generateBongReply({
    apiKey: '',
    model: 'gemini-2.5-flash-lite',
    history: [{ role: 'user', text: 'Xin chào' }],
    fetchImpl: async () => { throw new Error('Should never call network without key') },
  }),
  /API key/i,
)

await assert.rejects(
  generateBongReply({
    apiKey: 'test',
    model: '../../test',
    history: [{ role: 'user', text: 'Xin chào' }],
    fetchImpl: fakeFetch,
  }),
  /không hợp lệ/,
)

await assert.rejects(
  generateBongReply({
    apiKey: 'test',
    model: 'gemini-2.5-flash-lite',
    history: [{ role: 'user', text: 'Xin chào' }],
    fetchImpl: async () => new Response('{}', { status: 429 }),
  }),
  /hạn mức/i,
)
console.log('PASS: BÔNG demo labeling, Gemini request, BYOK secret protection and error handling')
