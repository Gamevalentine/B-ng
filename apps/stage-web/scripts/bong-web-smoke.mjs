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
      await textInput.fill('Xin chào')
      await page.locator('[data-testid="bong-chat-send"]').click()
      await page.locator('[data-testid="bong-chat-messages"]').getByText('Phản hồi mô phỏng · không phải AI').waitFor({ state: 'visible', timeout: 10000 })
      await page.locator('[data-testid="bong-mode-gemini"]').click()
      await textInput.fill('Xin chào')
      await page.locator('[data-testid="bong-chat-send"]').click()
      await page.locator('[data-testid="bong-chat-error"]').getByText(/nhập API key/i).waitFor({ state: 'visible', timeout: 10000 })
      const noKeyRequests = aiApiCalls.length
      if (noKeyRequests !== 0)
        throw new Error('BÔNG attempted an AI API request without explicit visitor key')

      // Intercept ALL Gemini requests in the browser. No live Google calls or paid credits.
      const mockCalls = []
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
        mockCalls.push({ url: request.url(), payload, hasApiKey: !!request.headers()['x-goog-api-key'] })
        const answer = mockCalls.length === 1 ? 'Chào Minh, mình là BÔNG!' : 'Mình nhớ bạn tên Minh.'
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers,
          body: JSON.stringify({ candidates: [{ content: { parts: [{ text: answer }] } }] }),
        })
      })
      await page.locator('[data-testid="bong-api-key"]').fill('browser-test-key-never-real')
      await page.locator('[data-testid="bong-model"]').selectOption('gemini-3.1-flash-lite')
      await textInput.fill('Tôi tên là Minh')
      await page.locator('[data-testid="bong-chat-send"]').click()
      await page.locator('[data-testid="bong-chat-messages"]').getByText('Chào Minh, mình là BÔNG!').waitFor({ state: 'visible', timeout: 15000 })
      await page.locator('[data-testid="bong-ai-connected"]').waitFor({ state: 'visible', timeout: 5000 })
      await textInput.fill('Tôi tên gì?')
      await page.locator('[data-testid="bong-chat-send"]').click()
      await page.locator('[data-testid="bong-chat-messages"]').getByText('Mình nhớ bạn tên Minh.').waitFor({ state: 'visible', timeout: 15000 })
      if (mockCalls.length !== 2
        || !mockCalls.every(x => x.hasApiKey && x.url.includes('gemini-3.1-flash-lite:generateContent') && !x.url.includes('browser-test-key'))
        || mockCalls[1].payload.contents.map(x => x.role).join(',') !== 'user,model,user')
        throw new Error('Multi-turn Gemini browser integration or API key header failed')
      result.mockGeminiMultiTurnPassed = true
      await page.unrouteAll({ behavior: 'wait' })
      await page.locator('[data-testid="bong-mode-demo"]').click()
      result.aiApiCallsWithoutKey = noKeyRequests
      if (result.aiApiCallsWithoutKey !== 0)
        throw new Error('BÔNG attempted an AI API request without explicit visitor key')
      result.textChatPassed = true
      result.errors = pageErrors.slice(0, 10)
      result.missingAssets = assetErrors.slice(0, 10)
      if (!result.title.includes('BÔNG') || !result.headerText.includes('BÔNG') || result.headerText.includes('AIRI') || !result.brandingVisible || !result.brandAssetsLoaded || !result.textChatPassed || !result.mockGeminiMultiTurnPassed || result.errors.length || result.missingAssets.length)
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
