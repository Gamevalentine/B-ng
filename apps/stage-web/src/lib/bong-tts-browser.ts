/** Browser-provided speech synthesis only; this is NOT Mai Chi / Sherpa TTS. */
export interface BongBrowserVoice {
  name: string
  lang: string
  voiceURI: string
  localService?: boolean
  default?: boolean
}

export interface BongTTSSettings {
  voiceURI?: string
  rate?: number
}

export function findVietnameseVoices(voices: BongBrowserVoice[]): BongBrowserVoice[] {
  return voices.filter(voice => /^vi(?:-|$)/i.test(voice.lang))
    .sort((a, b) => Number(b.localService ?? false) - Number(a.localService ?? false)
      || a.name.localeCompare(b.name))
}

/** Avoid reading markup symbols, URLs, and very long responses verbatim. */
export function prepareVietnameseSpeech(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, ' đoạn mã ')
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' đường dẫn ')
    .replace(/[\\*_`#~>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 800)
}

export function clampBongSpeechRate(input: number): number {
  return Number.isFinite(input) ? Math.min(1.25, Math.max(0.8, input)) : 1
}

export function chooseVietnameseVoice<T extends BongBrowserVoice>(
  voices: T[],
  selectedURI: string,
): T | undefined {
  const vietnamese = findVietnameseVoices(voices) as T[]
  return vietnamese.find(v => v.voiceURI === selectedURI) ?? vietnamese[0]
}

export const BONG_TTS_NOTICE = 'Giọng nói do trình duyệt/hệ điều hành cung cấp; chưa phải giọng Mai Chi. Không thể xác minh giọng nữ chỉ từ tên giọng. Một số giọng có thể dùng dịch vụ trực tuyến.'
