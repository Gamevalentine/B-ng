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
      result.errors = pageErrors.slice(0, 10)
      result.missingAssets = assetErrors.slice(0, 10)
      if (!result.title.includes('BÔNG') || !result.headerText.includes('BÔNG') || result.headerText.includes('AIRI') || !result.brandingVisible || !result.brandAssetsLoaded)
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
