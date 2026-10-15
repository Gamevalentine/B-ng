// BÔNG browser-only QA. Runs inside GitHub Actions, never on the owner's Windows PC.
// This checks page load and the original BÔNG branding files, NOT voice quality
// or the Windows offline runtime. Playwright screenshots remain Actions artifacts.
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const baseURL = process.env.BONG_SMOKE_URL || 'http://127.0.0.1:4173'
const targetDir = 'bong-web-smoke-results'
await mkdir(targetDir, { recursive: true })

async function waitUntilReady() {
  for (let i = 0; i < 45; i++) {
    try {
      const response = await fetch(baseURL, { signal: AbortSignal.timeout(2000) })
      if (response.ok)
        return
    }
    catch { /* Server not ready. */ }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error('Web preview did not start within 45 seconds')
}

await waitUntilReady()
const browser = await chromium.launch({ headless: true })
const report = []
let failed = false

try {
  const cases = [
    { name: 'desktop', viewport: { width: 1440, height: 900 }, isMobile: false },
    { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true },
  ]

  for (const item of cases) {
    const context = await browser.newContext({
      viewport: item.viewport,
      deviceScaleFactor: 1,
      isMobile: item.isMobile,
      hasTouch: item.isMobile,
      locale: 'vi-VN',
      permissions: [],
    })
    // Install a fully simulated SpeechRecognition before the web app loads.
    // No real microphone/device permission or external speech service is used.
    await context.addInitScript(() => {
      class FakeVietnameseRecognition {
        lang = ''
        continuous = true
        interimResults = false
        maxAlternatives = 0
        onstart = null
        onresult = null
        onerror = null
        onend = null
        start() {
          window.__bongFakeMicrophone = this
          this.onstart?.()
        }
        stop() { this.onend?.() }
        abort() {}
        deliver(text, isFinal = true) {
          this.onresult?.({ results: [{ 0: { transcript: text }, length: 1, isFinal }] })
        }
        fail(code) {
          this.onerror?.({ error: code })
          this.onend?.()
        }
      }
      Object.defineProperty(window, 'SpeechRecognition', { value: FakeVietnameseRecognition, configurable: true })
      Object.defineProperty(window, 'webkitSpeechRecognition', { value: FakeVietnameseRecognition, configurable: true })
      // Fake voices & output: nothing reaches hardware, vendor services or microphone.
      window.__bongTtsCalls = []
      window.__bongTtsCancelCount = 0
      class FakeUtterance {
        constructor(text) {
          this.text = text
          this.lang = ''
          this.voice = null
          this.rate = 1
          this.pitch = 1
          this.onstart = null
          this.onend = null
          this.onerror = null
        }
      }
      const voices = [
        { name: 'BÔNG Vietnamese test voice', lang: 'vi-VN', voiceURI: 'mock-vi-VN', localService: true },
        { name: 'English test voice', lang: 'en-US', voiceURI: 'mock-en-US', localService: true },
      ]
      window.__bongFakeVoices = voices
      const fakeSynthesis = {
        getVoices() { return window.__bongFakeVoices },
        speak(utterance) {
          window.__bongTtsCalls.push({ text: utterance.text, lang: utterance.lang, voice: utterance.voice?.voiceURI, rate: utterance.rate })
          queueMicrotask(() => utterance.onstart?.())
        },
        cancel() { window.__bongTtsCancelCount++ },
        addEventListener() {},
        removeEventListener() {},
      }
      Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: FakeUtterance, configurable: true })
      Object.defineProperty(window, 'speechSynthesis', { value: fakeSynthesis, configurable: true })
      window.__bongNeuralAudioPlays = 0
      class FakeAudio {
        constructor(url) {
          this.src = url
          this.onended = null
          this.onerror = null
          this.paused = true
          this.ended = false
          this.currentTime = 0.065
          window.__bongCurrentAudio = this
        }
        play() {
          this.paused = false
          window.__bongNeuralAudioPlays++
          return Promise.resolve()
        }
        pause() { this.paused = true }
        finish() { this.ended = true; this.onended?.() }
      }
      Object.defineProperty(window, 'Audio', { value: FakeAudio, configurable: true })
    })
    const page = await context.newPage()
    const pageErrors = []
    const assetErrors = []
    const aiApiCalls = []
    page.on('request', request => {
      if (request.url().startsWith('https://generativelanguage.googleapis.com/'))
        aiApiCalls.push(request.url())
    })
    page.on('pageerror', error => pageErrors.push(error.message))
    page.on('response', (response) => {
      if (response.status() >= 400 && new URL(response.url()).origin === new URL(baseURL).origin)
        assetErrors.push({ status: response.status(), path: new URL(response.url()).pathname })
    })

    let result = {
      viewport: item.name,
      passed: false,
      title: '',
      headerText: '',
      landingURL: '',
      brandingVisible: false,
      brandAssetsLoaded: false,
      stageCanvasCount: 0,
      textChatPassed: false,
      aiApiCallsWithoutKey: 0,
      mockGeminiMultiTurnPassed: false,
      mockGeminiTransientRecoveryPassed: false,
      vietnameseMicrophonePassed: false,
      vietnameseBrowserTtsPassed: false,
      mockNeuralTtsPassed: false,
      live2dMouthSyncPassed: false,
      errors: [],
      missingAssets: [],
    }

    try {
      const response = await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 45000 })
      if (!response?.ok())
        throw new Error('Entry HTML did not return HTTP success')
      result.landingURL = page.url()
      result.title = await page.title()
      await page.locator('[data-testid="bong-web-preview-mark"]').waitFor({ state: 'visible', timeout: 30000 })
      const header = page.locator('[data-testid="bong-web-header"]:visible').first()
      await header.waitFor({ state: 'visible', timeout: 10000 })
      result.headerText = (await header.innerText()).trim()
      await page.waitForTimeout(5000)
      result.title = await page.title()
      result.brandingVisible = await page.locator('[data-testid="bong-web-preview-mark"]').isVisible()
      const imageReady = await page.locator('[data-testid="bong-original-logo"], [data-testid="bong-original-mascot"]').evaluateAll(images =>
        images.length === 2 && images.every(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0))
      result.brandAssetsLoaded = imageReady
      result.stageCanvasCount = await page.locator('canvas').count()
      // Giai đoạn 2: exercise actual browser text inputs without calling an AI provider.
      const textInput = page.locator('[data-testid="bong-chat-input"]')
      await textInput.waitFor({ state: 'visible', timeout: 10000 })

      // Test 3A: voice -> Vietnamese text -> manual submit. No speech call leaves this browser.
      await textInput.fill('Bạn ơi')
      await page.locator('[data-testid="bong-speech-mic"]').click()
      await page.locator('[data-testid="bong-speech-status"]').getByText(/đang nghe tiếng việt/i).waitFor()
      const micOptions = await page.evaluate(() => ({
        lang: window.__bongFakeMicrophone.lang,
        continuous: window.__bongFakeMicrophone.continuous,
        interimResults: window.__bongFakeMicrophone.interimResults,
      }))
      if (micOptions.lang !== 'vi-VN' || micOptions.continuous || !micOptions.interimResults)
        throw new Error('Vietnamese microphone configuration is incorrect')
      await page.evaluate(() => window.__bongFakeMicrophone.deliver('Hôm nay', false))
      await page.locator('[data-testid="bong-speech-interim"]').getByText(/hôm nay/i).waitFor()
      await page.evaluate(() => {
        window.__bongFakeMicrophone.deliver('hôm nay thế nào', true)
        window.__bongFakeMicrophone.stop()
      })
      if (await textInput.inputValue() !== 'Bạn ơi hôm nay thế nào')
        throw new Error('Voice result was not correctly added to the unsent input')
      if (await page.locator('[data-testid="bong-chat-messages"]').getByText('Bạn ơi hôm nay thế nào').count())
        throw new Error('Speech input was sent automatically without user confirmation')
      await page.locator('[data-testid="bong-speech-mic"]').click()
      await page.evaluate(() => window.__bongFakeMicrophone.fail('not-allowed'))
      await page.locator('[data-testid="bong-speech-status"]').getByText(/cấp quyền micro/i).waitFor()
      if (await textInput.inputValue() !== 'Bạn ơi hôm nay thế nào')
        throw new Error('Denied microphone permission erased the draft')
      await page.locator('[data-testid="bong-speech-mic"]').click()
      await page.evaluate(() => window.__bongFakeMicrophone.fail('no-speech'))
      await page.locator('[data-testid="bong-speech-status"]').getByText(/chưa nghe rõ/i).waitFor()
      result.vietnameseMicrophonePassed = true
      await textInput.fill('Xin chào')
      await page.locator('[data-testid="bong-chat-send"]').click()
      await page.locator('[data-testid="bong-chat-messages"]').getByText('Phản hồi mô phỏng · không phải AI').waitFor({ state: 'visible', timeout: 10000 })
      // Settings must be collapsed by default: the conversation takes priority.
      if (await page.locator('[data-testid="bong-expanded-settings"]').count())
        throw new Error('Settings take up chat space when they should be collapsed')
      await page.locator('[data-testid="bong-settings-toggle"]').click()
      await page.locator('[data-testid="bong-tts-engine"]').selectOption('browser')
      await page.locator('[data-testid="bong-tts-voice"]').selectOption('mock-vi-VN')
      await page.locator('[data-testid="bong-tts-rate"]').selectOption('0.9')
      if (await page.locator('[data-testid="bong-tts-auto"]').isChecked())
        throw new Error('Automatic voice playback must be opt-in')
      if (await page.evaluate(() => window.__bongTtsCalls.length) !== 0)
        throw new Error('Browser played audio without user action')
      await page.locator('[data-testid="bong-tts-speak"]').first().click()
      await page.locator('[data-testid="bong-tts-stop"]').waitFor({ state: 'visible', timeout: 10000 })
      const spoken = await page.evaluate(() => window.__bongTtsCalls[0])
      if (spoken.voice !== 'mock-vi-VN' || spoken.lang !== 'vi-VN' || spoken.rate !== 0.9 || !spoken.text.includes('BÔNG'))
        throw new Error('BÔNG did not use the selected Vietnamese voice at the selected speed')
      await page.locator('[data-testid="bong-tts-stop"]').click()
      if ((await page.evaluate(() => window.__bongTtsCancelCount)) < 1)
        throw new Error('BÔNG did not cancel speech when user requested stop')
      // Regression: user's Chrome lists NO Vietnamese voice, read button must still work.
      await page.evaluate(() => { window.__bongFakeVoices = [] })
      await page.locator('[data-testid="bong-tts-refresh"]').click()
      await page.locator('[data-testid="bong-tts-voice"]').selectOption('__system_default__')
      await page.locator('[data-testid="bong-tts-unavailable"]').waitFor({ state: 'visible', timeout: 5000 })
      await page.locator('[data-testid="bong-tts-speak"]').first().click()
      const lastFallback = await page.evaluate(() => window.__bongTtsCalls.at(-1))
      if (lastFallback.voice !== undefined || lastFallback.lang !== 'vi-VN')
        throw new Error('Fallback did not attempt system voice with Vietnamese language')
      await page.locator('[data-testid="bong-tts-stop"]').click()
      await page.evaluate(() => { window.__bongFakeVoices = [{ name: 'BÔNG Vietnamese test voice', lang: 'vi-VN', voiceURI: 'mock-vi-VN', localService: true }] })
      await page.locator('[data-testid="bong-tts-refresh"]').click()
      await page.locator('[data-testid="bong-tts-voice"]').selectOption('mock-vi-VN')
      await page.locator('[data-testid="bong-tts-auto"]').check()
      await page.locator('[data-testid="bong-mode-gemini"]').click()
      await textInput.fill('Xin chào')
      await page.locator('[data-testid="bong-chat-send"]').click()
      await page.locator('[data-testid="bong-chat-error"]').getByText(/nhập API key/i).waitFor({ state: 'visible', timeout: 10000 })
      const noKeyRequests = aiApiCalls.length
      if (noKeyRequests !== 0)
        throw new Error('BÔNG attempted an AI API request without explicit visitor key')

      // Intercept ALL Gemini requests in the browser. No live Google calls or paid credits.
      const mockCalls = []
      const neuralTtsCalls = []
      let transientCount = 0
      await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
        const request = route.request()
        const headers = {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': '*',
          'cache-control': 'no-store',
        }
        if (request.method() === 'OPTIONS') {
          await route.fulfill({ status: 204, headers })
          return
        }
        const payload = request.postDataJSON()
        if (request.url().includes('gemini-3.1-flash-tts-preview')) {
          neuralTtsCalls.push({
            url: request.url(),
            voice: payload.generationConfig?.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName,
            apiKeyHeader: request.headers()['x-goog-api-key'],
          })
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers,
            body: JSON.stringify({ candidates: [{ content: { parts: [{
              inlineData: { data: (() => {
                const pcm = Buffer.alloc(4800)
                // 2.4k samples. Loud speech in the first 0.1s.
                for (let i = 0; i < 2400; i++)
                  pcm.writeInt16LE(Math.round(11000 * Math.sin(2 * Math.PI * 250 * i / 24000)), i * 2)
                return pcm.toString('base64')
              })(), mimeType: 'audio/l16; rate=24000; channels=1' },
            }] } }] }),
          })
          return
        }
        mockCalls.push({ url: request.url(), payload, hasApiKey: !!request.headers()['x-goog-api-key'] })
        const lastText = payload.contents.at(-1)?.parts?.[0]?.text
        if (lastText === 'Kiểm tra lỗi 503' && ++transientCount === 1) {
          await route.fulfill({
            status: 503,
            contentType: 'application/json',
            headers,
            body: JSON.stringify({ error: { code: 503, status: 'UNAVAILABLE' } }),
          })
          return
        }
        const answer = lastText === 'Kiểm tra lỗi 503'
          ? 'Em đã thử lại và trả lời được rồi!'
          : mockCalls.length === 1 ? 'Chào Minh, mình là BÔNG!' : 'Mình nhớ bạn tên Minh.'
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers,
          body: JSON.stringify({ candidates: [{ content: { parts: [{ text: answer }] } }] }),
        })
      })
      await page.locator('[data-testid="bong-api-key"]').fill('browser-test-key-never-real')
      await page.locator('[data-testid="bong-model"]').selectOption('gemini-3.5-flash-lite')
      await textInput.fill('Tôi tên là Minh')
      await page.locator('[data-testid="bong-chat-send"]').click()
      await page.locator('[data-testid="bong-chat-messages"]').getByText('Chào Minh, mình là BÔNG!').waitFor({ state: 'visible', timeout: 15000 })
      await page.locator('[data-testid="bong-ai-connected"]').waitFor({ state: 'visible', timeout: 5000 })
      await page.waitForFunction(() => window.__bongTtsCalls.some(x => x.text.includes('Chào Minh')), { timeout: 10000 })
      result.vietnameseBrowserTtsPassed = true
      await textInput.fill('Tôi tên gì?')
      await page.locator('[data-testid="bong-chat-send"]').click()
      await page.locator('[data-testid="bong-chat-messages"]').getByText('Mình nhớ bạn tên Minh.').waitFor({ state: 'visible', timeout: 15000 })
      if (mockCalls.length !== 2
        || !mockCalls.every(x => x.hasApiKey && x.url.includes('gemini-3.5-flash-lite:generateContent') && !x.url.includes('browser-test-key'))
        || mockCalls[1].payload.contents.map(x => x.role).join(',') !== 'user,model,user')
        throw new Error('Multi-turn Gemini browser integration or API key header failed')
      // Recover once from a simulated transient 503 without ever calling Google.
      await textInput.fill('Kiểm tra lỗi 503')
      await page.locator('[data-testid="bong-chat-send"]').click()
      await page.locator('[data-testid="bong-chat-messages"]').getByText('Em đã thử lại và trả lời được rồi!').waitFor({ state: 'visible', timeout: 15000 })
      if (transientCount !== 2 || mockCalls.length !== 4)
        throw new Error('Gemini 503 retry was not bounded to a single extra request')
      result.mockGeminiTransientRecoveryPassed = true
      result.mockGeminiMultiTurnPassed = true

      // No hardware audio: intercept neural TTS HTTP response and fake audio playback.
      await page.locator('[data-testid="bong-tts-auto"]').uncheck()
      await page.locator('[data-testid="bong-tts-engine"]').selectOption('gemini')
      await page.locator('[data-testid="bong-gemini-tts-voice"]').selectOption('Leda')
      await page.locator('[data-testid="bong-tts-speak"]').last().click()
      await page.waitForFunction(() => window.__bongNeuralAudioPlays > 0, { timeout: 12000 })
      await page.waitForFunction(() => {
        const c = document.querySelector('[data-testid="bong-text-chat"]')
        return c?.getAttribute('data-bong-speaking') === 'true' && Number(c?.getAttribute('data-bong-mouth-open')) > 0.05
      }, { timeout: 7000 })
      if (neuralTtsCalls.length !== 1 || neuralTtsCalls[0].voice !== 'Leda'
        || neuralTtsCalls[0].apiKeyHeader !== 'browser-test-key-never-real'
        || neuralTtsCalls[0].url.includes('browser-test-key'))
        throw new Error('Vietnamese Gemini TTS call, user-selected voice or secret handling incorrect')
      await page.locator('[data-testid="bong-tts-stop"]').click()
      await page.waitForFunction(() => {
        const c = document.querySelector('[data-testid="bong-text-chat"]')
        return c?.getAttribute('data-bong-speaking') === 'false' && Number(c?.getAttribute('data-bong-mouth-open')) === 0
      }, { timeout: 5000 })
      // Test natural end, not only user clicking Stop.
      await page.locator('[data-testid="bong-tts-speak"]').last().click()
      await page.waitForFunction(() => document.querySelector('[data-testid="bong-text-chat"]')?.getAttribute('data-bong-speaking') === 'true', { timeout: 10000 })
      await page.evaluate(() => window.__bongCurrentAudio.finish())
      await page.waitForFunction(() => document.querySelector('[data-testid="bong-text-chat"]')?.getAttribute('data-bong-speaking') === 'false', { timeout: 5000 })
      result.live2dMouthSyncPassed = true
      result.mockNeuralTtsPassed = true
      await page.unrouteAll({ behavior: 'wait' })
      await page.locator('[data-testid="bong-mode-demo"]').click()
      result.aiApiCallsWithoutKey = noKeyRequests
      if (result.aiApiCallsWithoutKey !== 0)
        throw new Error('BÔNG attempted an AI API request without explicit visitor key')
      result.textChatPassed = true
      result.errors = pageErrors.slice(0, 10)
      result.missingAssets = assetErrors.slice(0, 10)
      if (!result.title.includes('BÔNG') || !result.headerText.includes('BÔNG') || result.headerText.includes('AIRI') || !result.brandingVisible || !result.brandAssetsLoaded || !result.textChatPassed || !result.mockGeminiMultiTurnPassed || !result.mockGeminiTransientRecoveryPassed || !result.vietnameseMicrophonePassed || !result.vietnameseBrowserTtsPassed || !result.mockNeuralTtsPassed || !result.live2dMouthSyncPassed || result.errors.length || result.missingAssets.length)
        throw new Error('BÔNG title/branding or desktop-source image assets did not load')
      // Canvas presence and JS errors are measured separately: a canvas is not proof
      // that the original BÔNG Live2D rig/voice implementation is operational.
      result.passed = true
    }
    catch (error) {
      failed = true
      result.failure = String(error)
      result.title ||= await page.title().catch(() => '')
      result.landingURL ||= page.url()
      result.errors = pageErrors.slice(0, 10)
      result.missingAssets = assetErrors.slice(0, 10)
      result.bodyExcerpt = await page.locator('body').innerText().then(text => text.slice(0, 500)).catch(() => '')
    }
    finally {
      await page.screenshot({ path: `${targetDir}/${item.name}.png`, fullPage: true }).catch(() => {})
      report.push(result)
      await context.close()
    }
  }
}
finally {
  await browser.close()
  await writeFile(`${targetDir}/report.json`, JSON.stringify({ baseURL, time: new Date().toISOString(), cases: report }, null, 2))
}

console.log(JSON.stringify(report, null, 2))
if (failed)
  process.exitCode = 1
