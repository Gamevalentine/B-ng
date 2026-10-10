import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'

import { app, protocol } from 'electron'

import { parseMaiChiRequest, shutdownMaiChiWorker, synthesizeMaiChi } from './bong-zero-tts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const BONG_VOICE = 'vi-VN-vais1000-medium'
const BONG_MODEL = 'piper-vais1000-medium'
const MAX_TTS_LENGTH = 900

export function parseBongPiperRequest(value: unknown): string {
  if (!value || typeof value !== 'object')
    throw new Error('Yêu cầu phát giọng không hợp lệ.')
  const r = value as { input?: unknown, voice?: unknown, model?: unknown }
  if (r.model !== BONG_MODEL || r.voice !== BONG_VOICE)
    throw new Error('Mô hình hoặc giọng nói không được hỗ trợ.')
  if (typeof r.input !== 'string' || !r.input.trim() || r.input.length > MAX_TTS_LENGTH)
    throw new Error('Văn bản đọc phải có từ 1 đến 900 ký tự.')
  // Prevent voice commands from injecting extra terminal lines. Piper reads
  // one line at a time; newlines inside the text must become spaces.
  return r.input.replace(/[\r\n\t]+/g, ' ').trim()
}

function piperDirectory(): string {
  const configured = process.env.BONG_PIPER_DIR?.trim()
  return configured ? resolve(configured) : resolve(process.cwd(), '..', '..', 'tools', 'bong-tts')
}

async function synthesize(text: string, signal?: AbortSignal): Promise<Uint8Array> {
  const base = piperDirectory()
  const executable = join(base, 'engine', 'piper', 'piper.exe')
  const model = join(base, 'vi_VN-vais1000-medium.onnx')
  if (!existsSync(executable) || !existsSync(model))
    throw new Error('Chưa cài giọng Piper tiếng Việt trên ổ E.')

  const temp = join(base, 'tmp')
  await mkdir(temp, { recursive: true })
  const out = join(temp, `bong-${randomUUID()}.wav`)

  try {
    await new Promise<void>((done, fail) => {
      const child = spawn(executable, ['--model', model, '--output_file', out], {
        cwd: dirname(executable),
        windowsHide: true,
        stdio: ['pipe', 'ignore', 'pipe'],
      })
      let settled = false
      const settle = (error?: Error) => {
        if (settled)
          return
        settled = true
        clearTimeout(timeout)
        signal?.removeEventListener('abort', abort)
        if (error)
          fail(error)
        else
          done()
      }
      const abort = () => {
        child.kill()
        settle(new Error('Đã hủy yêu cầu phát giọng.'))
      }
      const timeout = setTimeout(() => {
        child.kill()
        settle(new Error('Piper quá thời gian xử lý (30 giây).'))
      }, 30_000)
      child.on('error', (err) => settle(err))
      child.on('close', code => settle(code === 0 ? undefined : new Error(`Piper exit code ${code}`)))
      if (signal?.aborted) {
        abort()
        return
      }
      signal?.addEventListener('abort', abort, { once: true })
      child.stdin.on('error', () => {}) // A cancelled request may close stdin.
      child.stdin.end(`${text}\n`, 'utf8')
    })
    const wav = await readFile(out)
    if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE')
      throw new Error('Piper tạo tệp WAV không hợp lệ.')
    return new Uint8Array(wav)
  }
  finally {
    await rm(out, { force: true }).catch(() => {})
  }
}

/** Start only in BÔNG's own Electron main process, never a public web server. */
export function setupBongPiperTtsProtocol(): void {
  let work: Promise<void> = Promise.resolve()
  app.once('before-quit', shutdownMaiChiWorker)
  protocol.handle('airi-bong-tts', async (request) => {
    const url = new URL(request.url)
    if (url.host !== 'local' || url.pathname !== '/v1/audio/speech')
      return new Response('Not found', { status: 404, headers: CORS_HEADERS })
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    if (request.method !== 'POST')
      return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS })
    let text: string
    let useMaiChi = false
    try {
      const payload: unknown = await request.json()
      useMaiChi = !!payload && typeof payload === 'object' && (payload as { model?: string }).model === 'zerotts-maichi'
      text = useMaiChi ? parseMaiChiRequest(payload) : parseBongPiperRequest(payload)
    }
    catch (error) {
      return new Response(error instanceof Error ? error.message : 'Invalid request', { status: 400, headers: CORS_HEADERS })
    }

    // Serialize short requests to keep CPU/memory use predictable on laptops.
    const answer = work.then(() => useMaiChi ? synthesizeMaiChi(text, request.signal) : synthesize(text, request.signal))
    work = answer.then(() => {}, () => {})
    try {
      const wav = await answer
      return new Response(wav, { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' } })
    }
    catch (error) {
      console.warn('[BONG TTS] Local speech generation failed:', error instanceof Error ? error.message : 'unknown')
      const detail = useMaiChi && error instanceof Error ? `Mai Chi: ${error.message}` : 'Không thể phát giọng nói offline trên máy này.'
      return new Response(detail, { status: 503, headers: CORS_HEADERS })
    }
  })
}
