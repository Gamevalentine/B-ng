// BÔNG standalone Cloudflare Pages build, without GitHub Actions or account secrets.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { existsSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../../..')
const expectedBranch = 'bong/web-voice-chat-fix-20261016'

// Keep this site strictly isolated from main and the user's production projects.
if (process.env.CF_PAGES === '1' && process.env.CF_PAGES_BRANCH !== expectedBranch) {
  console.error('BÔNG Cloudflare: từ chối triển khai nhánh không phải nhánh thử nghiệm.')
  process.exit(1)
}
if (!existsSync(resolve(root, 'pnpm-lock.yaml'))) {
  console.error('BÔNG Cloudflare: phải chạy từ repository chứa pnpm workspace và lockfile.')
  process.exit(1)
}
const env = {
  ...process.env,
  BONG_PAGES_BASE_PATH: '/',
  VITE_BONG_UI_PREVIEW: 'true',
  VITE_BONG_PAGES: 'true',
  VITE_ENABLE_POSTHOG: 'false',
}
console.log('BÔNG: building isolated Cloudflare Pages preview (without GitHub Actions).')
const build = spawnSync('pnpm', ['exec', 'turbo', 'run', 'build', '-F', '@proj-airi/stage-web', '--env-mode=loose'], {
  cwd: root,
  env,
  stdio: 'inherit',
})
if (build.error) {
  console.error('BÔNG: không chạy được pnpm:', build.error.message)
  process.exit(1)
}
if (build.status !== 0)
  process.exit(build.status || 1)
const validation = spawnSync(process.execPath, [resolve(here, 'bong-cloudflare-validate.mjs')], {
  cwd: root,
  env,
  stdio: 'inherit',
})
if (validation.error) {
  console.error('BÔNG: không chạy được kiểm tra Cloudflare:', validation.error.message)
  process.exit(1)
}
process.exit(validation.status || 0)
