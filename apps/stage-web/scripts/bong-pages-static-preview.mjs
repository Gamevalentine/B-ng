// Serve the compiled GitHub Pages bundle beneath /B-ng/, just like GitHub Pages.
// Vite preview can mistakenly serve files at /assets despite the production base,
// so it is not suitable for validating a repo-subpath deployment.
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'

const root = resolve('apps/stage-web/dist')
const mount = '/B-ng/'
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1:4173')
  if (!url.pathname.startsWith(mount)) {
    response.writeHead(404)
    response.end('Outside GitHub Pages /B-ng/ mount')
    return
  }

  let rawPath
  try {
    rawPath = decodeURIComponent(url.pathname.slice(mount.length))
  }
  catch {
    response.writeHead(400)
    response.end('Invalid URI')
    return
  }

  const file = resolve(root, rawPath || 'index.html')
  if (!file.startsWith(root + sep)) {
    response.writeHead(403)
    response.end('Invalid static path')
    return
  }

  try {
    const metadata = await stat(file)
    if (!metadata.isFile())
      throw new Error('Not a regular file')
    response.writeHead(200, {
      'content-type': contentTypes[extname(file)] || 'application/octet-stream',
      'content-length': String(metadata.size),
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    })
    createReadStream(file).pipe(response)
  }
  catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Missing file in published BÔNG bundle')
  }
})

server.listen(4173, '127.0.0.1', () => {
  console.log('Serving BÔNG Pages bundle at http://127.0.0.1:4173/B-ng/')
})
