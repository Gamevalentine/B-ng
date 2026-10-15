// Validate built BÔNG assets for the Cloudflare Pages Free plan.
// Do not silently delete character models or fonts: failing is safer than a broken site.
import { readdir, readFile, stat, unlink } from 'node:fs/promises'
import { resolve, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../dist')
const maxFileSize = 25 * 1024 * 1024 // Cloudflare Pages asset limit
const maxFiles = 20000 // Pages Free tier
const failures = []
const files = []
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const fullPath = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      await walk(fullPath)
    }
    else if (entry.isFile()) {
      // Dev-only source maps should never be published.
      if (entry.name.endsWith('.map')) {
        await unlink(fullPath)
        continue
      }
      const info = await stat(fullPath)
      const name = relative(root, fullPath).split(sep).join('/')
      files.push({ name, bytes: info.size })
      if (info.size > maxFileSize)
        failures.push(`Tệp quá 25 MiB: ${name} (${info.size} bytes)`)
    }
    else {
      failures.push(`Tệp không được hỗ trợ: ${fullPath}`)
    }
  }
}
try {
  await walk(root)
  const html = await readFile(resolve(root, 'index.html'), 'utf8')
  if (!/<script\s[^>]*type="module"/i.test(html) || !/<link\s[^>]*stylesheet/i.test(html))
    failures.push('index.html thiếu script hoặc stylesheet của bản build.')
  if (html.includes('/B-ng/assets/'))
    failures.push('Đường dẫn GitHub Pages /B-ng/ còn sót trong bản Cloudflare.')
  if (files.length > maxFiles)
    failures.push(`Quá số lượng tệp của Pages Free: ${files.length} > ${maxFiles}`)
}
catch (error) {
  console.error('BÔNG Cloudflare: không kiểm tra được dist:', error instanceof Error ? error.message : error)
  process.exit(1)
}
console.log(`BÔNG Cloudflare: ${files.length} files, total ${Math.round(files.reduce((n, f) => n + f.bytes, 0) / 1048576)} MiB`)
if (failures.length) {
  for (const failure of failures.slice(0, 25))
    console.error('BÔNG Cloudflare:', failure)
  process.exit(1)
}
console.log('BÔNG Cloudflare: asset preflight PASS (chưa phải kiểm thử trình duyệt thật).')
