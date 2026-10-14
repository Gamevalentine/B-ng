// Executed in GitHub Actions only; no external Gemini requests are made.
import assert from 'node:assert/strict'
import { DEFAULT_GEMINI_MODEL, generateBongReply, offlinePreviewReply } from '../src/lib/bong-chat.ts'
assert.equal(DEFAULT_GEMINI_MODEL, 'gemini-3.1-flash-lite')

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
  model: DEFAULT_GEMINI_MODEL,
  history: [{ role: 'user', text: 'Xin chào' }],
  fetchImpl: fakeFetch,
})
assert.equal(result, 'Xin chào, mình là BÔNG!')
assert.equal(captured.init.headers['x-goog-api-key'], 'test-key-never-real')
assert.equal(captured.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent')
assert.ok(!captured.url.includes('test-key-never-real'))
assert.equal(JSON.parse(captured.init.body).contents[0].parts[0].text, 'Xin chào')
assert.equal(captured.init.referrerPolicy, 'no-referrer')

await assert.rejects(
  generateBongReply({
    apiKey: '',
    model: DEFAULT_GEMINI_MODEL,
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
    model: DEFAULT_GEMINI_MODEL,
    history: [{ role: 'user', text: 'Xin chào' }],
    fetchImpl: async () => new Response('{}', { status: 429 }),
  }),
  /hạn mức/i,
)
// Multi-turn calls must transmit all previous conversation turns in correct order.
await generateBongReply({
  apiKey: 'test-key-never-real',
  model: DEFAULT_GEMINI_MODEL,
  history: [
    { role: 'user', text: 'Tôi tên là Minh' },
    { role: 'model', text: 'Chào Minh!' },
    { role: 'user', text: 'Tôi tên gì?' },
  ],
  fetchImpl: fakeFetch,
})
const multiTurn = JSON.parse(captured.init.body).contents
assert.deepEqual(multiTurn.map(x => x.role), ['user', 'model', 'user'])
assert.equal(multiTurn[0].parts[0].text, 'Tôi tên là Minh')
assert.equal(multiTurn[2].parts[0].text, 'Tôi tên gì?')

await assert.rejects(
  generateBongReply({
    apiKey: 'test',
    model: DEFAULT_GEMINI_MODEL,
    history: [{ role: 'user', text: 'Xin chào' }],
    fetchImpl: async () => { throw new TypeError('Failed to fetch') },
  }),
  /không kết nối được Gemini/i,
)

await assert.rejects(
  generateBongReply({
    apiKey: 'test',
    model: DEFAULT_GEMINI_MODEL,
    history: [{ role: 'user', text: 'Xin chào' }],
    fetchImpl: async () => new Response('{}', { status: 404 }),
  }),
  /không tìm thấy mô hình/i,
)

let transientCallCount = 0
let retryCount = 0
const transientResponse = await generateBongReply({
  apiKey: 'test-key-never-real',
  model: DEFAULT_GEMINI_MODEL,
  history: [{ role: 'user', text: 'Bông ơi, hôm nay em thế nào?' }],
  waitBeforeRetry: async (ms) => {
    assert.ok(ms >= 1100 && ms < 1500)
  },
  onRetry: status => { assert.equal(status, 503); retryCount++ },
  fetchImpl: async () => {
    transientCallCount++
    return transientCallCount === 1
      ? new Response('{}', { status: 503 })
      : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Em vẫn ổn ạ!' }] } }] }), { status: 200 })
  },
})
assert.equal(transientResponse, 'Em vẫn ổn ạ!')
assert.equal(transientCallCount, 2)
assert.equal(retryCount, 1)

let repeated503 = 0
await assert.rejects(generateBongReply({
  apiKey: 'test',
  model: DEFAULT_GEMINI_MODEL,
  history: [{ role: 'user', text: 'Xin chào' }],
  waitBeforeRetry: async () => {},
  fetchImpl: async () => { repeated503++; return new Response('{}', { status: 503 }) },
}), /HTTP 503.*thử lại một lần/i)
assert.equal(repeated503, 2, '503 must never retry indefinitely')

let quotaRequests = 0
await assert.rejects(generateBongReply({
  apiKey: 'test',
  model: DEFAULT_GEMINI_MODEL,
  history: [{ role: 'user', text: 'Xin chào' }],
  waitBeforeRetry: async () => { throw new Error('429 must not sleep/retry') },
  fetchImpl: async () => { quotaRequests++; return new Response('{}', { status: 429 }) },
}), /HTTP 429/)
assert.equal(quotaRequests, 1, 'No automatic retries or billable model switch on 429')

console.log('PASS: BÔNG multi-turn + one bounded 503 retry + no quota retries + key protection')
