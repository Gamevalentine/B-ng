/**
 * BÔNG 3C: derive mouth movement from the *actual* Gemini PCM/WAV waveform.
 * This drives the existing Live2D speaking store, without a new inference API.
 * Frame RMS is a volume proxy, not phoneme-perfect viseme alignment.
 */
export interface BongWavEnvelope {
  levels: number[]
  intervalSeconds: number
}

export function extractBongWavEnvelope(data: Uint8Array, intervalMs = 40): BongWavEnvelope {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const tag = (at: number, val: string) => {
    if (at + val.length > data.byteLength) return false
    return [...val].every((char, i) => data[at + i] === char.charCodeAt(0))
  }
  if (data.length < 44 || !tag(0, 'RIFF') || !tag(8, 'WAVE'))
    throw new Error('Không thể đồng bộ miệng: dữ liệu WAV chưa hợp lệ.')
  let channels = 0
  let bits = 0
  let rate = 0
  let encoding = 0
  let dataOffset = -1
  let dataLength = 0
  let offset = 12
  while (offset + 8 <= data.length) {
    const size = view.getUint32(offset + 4, true)
    const start = offset + 8
    if (size > data.length - start) break
    if (tag(offset, 'fmt ') && size >= 16) {
      encoding = view.getUint16(start, true)
      channels = view.getUint16(start + 2, true)
      rate = view.getUint32(start + 4, true)
      bits = view.getUint16(start + 14, true)
    }
    if (tag(offset, 'data')) {
      dataOffset = start
      dataLength = size
      break
    }
    offset = start + size + (size % 2)
  }
  if (encoding !== 1 || channels !== 1 || bits !== 16 || rate < 8000 || rate > 48000
    || dataOffset < 0 || dataLength < 2)
    throw new Error('Chỉ hỗ trợ WAV PCM16 mono cho đồng bộ miệng.')
  const bytesPerFrame = 2
  const samples = Math.floor(dataLength / bytesPerFrame)
  const samplesPerEnvelope = Math.max(1, Math.round(rate * intervalMs / 1000))
  const levels: number[] = []
  const frameCount = Math.ceil(samples / samplesPerEnvelope)
  if (frameCount > 20000) throw new Error('Tệp âm thanh quá dài.')
  for (let frame = 0; frame < frameCount; frame++) {
    const start = frame * samplesPerEnvelope
    const end = Math.min(samples, start + samplesPerEnvelope)
    let sumSquares = 0
    for (let i = start; i < end; i++) {
      const amp = view.getInt16(dataOffset + i * 2, true) / 32768
      sumSquares += amp * amp
    }
    const rms = Math.sqrt(sumSquares / (end - start))
    // Noise floor suppression, conservative gain; silent audio remains closed.
    const magnitude = Math.max(0, rms - 0.012)
    levels.push(Math.min(1, magnitude * 4.2))
  }
  return { levels, intervalSeconds: samplesPerEnvelope / rate }
}

export function sampleBongMouthOpen(envelope: BongWavEnvelope, playbackSeconds: number): number {
  if (!Number.isFinite(playbackSeconds) || playbackSeconds < 0 || !envelope.levels.length)
    return 0
  const frame = Math.floor(playbackSeconds / envelope.intervalSeconds)
  if (frame >= envelope.levels.length)
    return 0
  const value = envelope.levels[frame] ?? 0
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0
}

/** Subtle approximation for browser TTS; Chrome does not expose its audio samples. */
export function approximateBrowserMouth(nowMs: number, startedMs: number): number {
  const time = Math.max(0, nowMs - startedMs) / 1000
  return 0.23 + 0.31 * Math.abs(Math.sin(2 * Math.PI * 3.7 * time))
}
