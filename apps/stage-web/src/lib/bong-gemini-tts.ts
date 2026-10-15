/** BÔNG optional cloud TTS preview using the visitor's own Gemini key.
 * No paid account setup, no token persistence, no automatic provider fallback.
 * Gemini 3.1 Flash TTS supports Vietnamese; voices are samples, not Mai Chi.
 */
export const BONG_GEMINI_TTS_MODEL = 'gemini-3.1-flash-tts-preview'
export const BONG_GEMINI_VOICES = [
  { id: 'Leda', label: 'Leda · trẻ trung' },
  { id: 'Zephyr', label: 'Zephyr · tươi sáng' },
  { id: 'Kore', label: 'Kore · vững vàng' },
] as const

export function pcmToWav(pcm: Uint8Array, sampleRate = 24000): Uint8Array {
  if (!pcm.length || pcm.length % 2 || pcm.length > 8_000_000)
    throw new Error('Dữ liệu giọng nói không hợp lệ.')
  const wav = new Uint8Array(pcm.length + 44)
  const view = new DataView(wav.buffer)
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) wav[offset + i] = text.charCodeAt(i)
  }
  write(0, 'RIFF')
  view.setUint32(4, pcm.length + 36, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // signed PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  write(36, 'data')
  view.setUint32(40, pcm.length, true)
  wav.set(pcm, 44)
  return wav
}

function decodeAudioBase64(encoded: string): Uint8Array {
  if (!encoded || encoded.length > 12_000_000 || !/^[A-Za-z0-9+/=]+$/.test(encoded))
    throw new Error('Gemini trả về tệp âm thanh không hợp lệ.')
  const raw = atob(encoded)
  const data = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++)
    data[i] = raw.charCodeAt(i)
  return data
}

export interface GeminiBongTtsArgs {
  text: string
  key: string
  voice?: string
  signal?: AbortSignal
  fetchImpl?: typeof fetch
}

/** Returns WAV; makes one request, never retries or switches tiers. */
export async function generateGeminiBongWav({
  text, key, voice = 'Leda', signal, fetchImpl = fetch,
}: GeminiBongTtsArgs): Promise<Uint8Array> {
  if (!key.trim())
    throw new Error('Cần API key Gemini trong phần Cài đặt để thử giọng AI.')
  if (!BONG_GEMINI_VOICES.some(item => item.id === voice))
    throw new Error('Giọng AI không hợp lệ.')
  const spoken = text.trim().slice(0, 350)
  if (!spoken)
    throw new Error('Không có nội dung để đọc.')
  if (signal?.aborted)
    throw new Error('Đã dừng tạo giọng đọc.')
  let response: Response
  try {
    response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${BONG_GEMINI_TTS_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key.trim() },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Đọc chính xác bằng tiếng Việt tự nhiên, giọng trẻ trung thân thiện: ${spoken}` }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
      }),
      signal,
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      mode: 'cors',
    })
  }
  catch {
    if (signal?.aborted) throw new Error('Đã dừng tạo giọng đọc.')
    throw new Error('Không thể kết nối dịch vụ giọng nói Gemini.')
  }
  if (!response.ok) {
    if (response.status === 429) throw new Error('Đã hết hạn mức tạo giọng AI; BÔNG không tự thử lại.')
    if (response.status === 403) throw new Error('API key không có quyền dùng Gemini TTS hoặc tài khoản đã hết hạn mức.')
    if (response.status === 404) throw new Error('Mô hình Gemini TTS chưa khả dụng với API key này.')
    if ([400, 401].includes(response.status)) throw new Error('API key hoặc yêu cầu TTS không hợp lệ.')
    throw new Error(`Gemini TTS gặp lỗi HTTP ${response.status}. Không tự gọi lại.`)
  }
  const payload = await response.json() as {
    candidates?: { content?: { parts?: { inlineData?: { data?: string, mimeType?: string } }[] } }[]
  }
  const audio = payload.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data)?.inlineData
  if (!audio?.data) throw new Error('Gemini TTS không trả về âm thanh.')
  const decoded = decodeAudioBase64(audio.data)
  if (audio.mimeType?.startsWith('audio/wav') || String.fromCharCode(...decoded.subarray(0, 4)) === 'RIFF')
    return decoded
  if (!audio.mimeType?.startsWith('audio/l16') && !audio.mimeType?.startsWith('audio/pcm'))
    throw new Error('Định dạng âm thanh Gemini chưa được hỗ trợ.')
  const sampleRate = Number(audio.mimeType.match(/rate=(\d+)/)?.[1] ?? '24000')
  if (sampleRate < 8000 || sampleRate > 48000) throw new Error('Tần số âm thanh không hợp lệ.')
  return pcmToWav(decoded, sampleRate)
}
