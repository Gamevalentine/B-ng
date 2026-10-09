import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import process from 'node:process'
import { createInterface } from 'node:readline'

type JobResult = { id: number, ok: boolean, elapsedMs?: number, audioBase64?: string, error?: string }
type Pending = { resolve: (result: JobResult) => void, reject: (error: Error) => void }

let processHandle: ChildProcessWithoutNullStreams | undefined
let bootPromise: Promise<void> | undefined
let sequence = 0
const jobs = new Map<number, Pending>()

function baseDirectory(): string {
  return process.env.BONG_ZEROTTS_DIR?.trim()
    ? resolve(process.env.BONG_ZEROTTS_DIR.trim())
    : resolve(process.cwd(), '..', '..', 'tools', 'bong-tts', 'zerotts')
}

function rejectJobs(error: Error) {
  for (const job of jobs.values())
    job.reject(error)
  jobs.clear()
}

function stopWorker(reason: string) {
  const child = processHandle
  processHandle = undefined
  bootPromise = undefined
  if (child)
    child.kill()
  rejectJobs(new Error(reason))
}

export function shutdownMaiChiWorker() {
  stopWorker('BÔNG đang đóng, đã dừng giọng Mai Chi.')
}

function ensureMaiChiWorker(): Promise<void> {
  if (bootPromise)
    return bootPromise

  const base = baseDirectory()
  const python = join(base, 'venv', 'Scripts', 'python.exe')
  const worker = join(base, 'worker-maichi.py')
  if (!existsSync(python) || !existsSync(worker))
    return Promise.reject(new Error('ZeroTTS Mai Chi chưa được cài đặt trên ổ E.'))

  bootPromise = new Promise<void>((resolveReady, rejectReady) => {
    const temp = resolve(base, '..', 'tmp')
    const env = {
      ...process.env,
      HF_HOME: join(base, 'hf-cache'),
      HUGGINGFACE_HUB_CACHE: join(base, 'hf-cache', 'hub'),
      HF_HUB_OFFLINE: '1',
      TEMP: temp,
      TMP: temp,
      PYTHONPYCACHEPREFIX: join(temp, 'pycache'),
      OMP_NUM_THREADS: '4',
      OPENBLAS_NUM_THREADS: '4',
    }
    const child = spawn(python, ['-u', worker], {
      env, cwd: base, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
    })
    processHandle = child
    let isReady = false
    const timer = setTimeout(() => {
      if (!isReady) {
        rejectReady(new Error('ZeroTTS quá thời gian nạp mô hình (90 giây).'))
        stopWorker('Mai Chi khởi tạo quá lâu.')
      }
    }, 90_000)
    child.stderr.on('data', () => {}) // Drain logs but never record private spoken text.
    createInterface({ input: child.stdout }).on('line', (line) => {
      let data: { type?: string, id?: number, ok?: boolean, elapsedMs?: number, audioBase64?: string, error?: string }
      try { data = JSON.parse(line) }
      catch { return }
      if (data.type === 'ready' && !isReady) {
        isReady = true
        clearTimeout(timer)
        console.info('[BÔNG Mai Chi] Local Vietnamese model ready.')
        resolveReady()
      }
      if (data.type === 'result' && typeof data.id === 'number') {
        const job = jobs.get(data.id)
        if (!job)
          return
        jobs.delete(data.id)
        if (data.ok)
          job.resolve({ id: data.id, ok: true, elapsedMs: data.elapsedMs, audioBase64: data.audioBase64 })
        else
          job.reject(new Error(`ZeroTTS worker result: ${data.error || 'unknown'}`))
      }
    })
    const failed = (error: Error) => {
      clearTimeout(timer)
      if (!isReady)
        rejectReady(error)
      if (processHandle === child) {
        processHandle = undefined
        bootPromise = undefined
      }
      rejectJobs(error)
    }
    child.once('error', failed)
    child.once('exit', code => failed(new Error(`ZeroTTS worker exited: ${code}`)))
  })
  return bootPromise
}

export function parseMaiChiRequest(value: unknown): string {
  if (!value || typeof value !== 'object')
    throw new Error('Yêu cầu giọng Mai Chi không hợp lệ.')
  const req = value as { model?: unknown, voice?: unknown, input?: unknown }
  if (req.model !== 'zerotts-maichi' || req.voice !== 'vi-VN-maichi')
    throw new Error('Tên mô hình Mai Chi không khớp.')
  if (typeof req.input !== 'string' || req.input.trim().length === 0 || req.input.length > 900)
    throw new Error('Câu cần đọc phải có từ 1 đến 900 ký tự.')
  return req.input.replace(/[\r\n\t]+/g, ' ').trim()
}

export async function synthesizeMaiChi(text: string, signal?: AbortSignal): Promise<Uint8Array> {
  signal?.throwIfAborted()
  await ensureMaiChiWorker()
  signal?.throwIfAborted()

  const child = processHandle
  if (!child)
    throw new Error('Mai Chi không còn hoạt động.')
  const id = ++sequence

  const response = await new Promise<JobResult>((resolveResult, rejectResult) => {
      let settled = false
      const finish = (error?: Error, result?: JobResult) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
        jobs.delete(id)
        if (error) rejectResult(error)
        else resolveResult(result!)
      }
      const abort = () => {
        stopWorker('Mai Chi đã dừng theo yêu cầu.')
        finish(new Error('Đã hủy lượt đọc.'))
      }
      const timer = setTimeout(() => {
        stopWorker('ZeroTTS xử lý một câu quá 45 giây.')
        finish(new Error('ZeroTTS xử lý quá lâu.'))
      }, 45_000)
      signal?.addEventListener('abort', abort, { once: true })
      jobs.set(id, {
        resolve: result => finish(undefined, result),
        reject: error => finish(error),
      })
      child.stdin.write(JSON.stringify({ id, text }) + '\n', 'utf8', err => {
        if (err)
          finish(err)
      })
  })
  console.info('[BÔNG Mai Chi] Generated WAV directly from worker', { durationMs: response.elapsedMs })
  const wav = Buffer.from(response.audioBase64 ?? '', 'base64')
  if (wav.byteLength < 44 || wav.toString('ascii', 0, 4) !== 'RIFF')
    throw new Error('ZeroTTS trả WAV không hợp lệ.')
  return new Uint8Array(wav)
}
