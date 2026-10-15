/** Browser Web Speech STT for the optional BÔNG 3A preview. No Sherpa or offline model is implied. */
export interface SpeechResultAlternative {
  transcript: string
}
export interface SpeechResultGroup {
  isFinal: boolean
  readonly length: number
  [index: number]: SpeechResultAlternative
}
export interface SpeechResultEvent {
  readonly results: ArrayLike<SpeechResultGroup>
}
export interface BrowserSpeechRecognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onstart: (() => void) | null
  onresult: ((event: SpeechResultEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
export type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition

interface BrowserSpeechScope {
  SpeechRecognition?: BrowserSpeechRecognitionConstructor
  webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor
}
export function resolveVietnameseRecognition(
  scope: BrowserSpeechScope = globalThis as BrowserSpeechScope,
): BrowserSpeechRecognitionConstructor | undefined {
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition
}
export function createVietnameseRecognizer(scope?: BrowserSpeechScope): BrowserSpeechRecognition {
  const SpeechRecognition = resolveVietnameseRecognition(scope)
  if (!SpeechRecognition)
    throw new Error('Trình duyệt này chưa hỗ trợ nhận diện tiếng Việt bằng Web Speech. Hãy thử Chrome mới nhất.')
  const recognizer = new SpeechRecognition()
  recognizer.lang = 'vi-VN'
  recognizer.continuous = false
  recognizer.interimResults = true
  recognizer.maxAlternatives = 1
  return recognizer
}

export function extractVietnameseTranscript(event: SpeechResultEvent): { final: string, interim: string } {
  const final: string[] = []
  const interim: string[] = []
  for (let i = 0; i < event.results.length; i++) {
    const group = event.results[i]
    const text = group?.[0]?.transcript?.trim() ?? ''
    if (!text)
      continue
    if (group.isFinal)
      final.push(text)
    else
      interim.push(text)
  }
  return { final: final.join(' ').trim(), interim: interim.join(' ').trim() }
}

export function appendSpokenText(typed: string, spoken: string): string {
  const existing = typed.trim()
  const voice = spoken.trim()
  return [existing, voice].filter(Boolean).join(' ').slice(0, 1200)
}

export function voiceRecognitionError(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Chrome chưa được phép sử dụng micro. Hãy cấp quyền micro cho website rồi thử lại.'
    case 'audio-capture':
      return 'Không tìm thấy micro khả dụng. Kiểm tra thiết bị ghi âm trong Windows hoặc Chrome.'
    case 'no-speech':
      return 'BÔNG chưa nghe rõ tiếng nói. Hãy thử nói gần micro hơn.'
    case 'network':
      return 'Dịch vụ nhận diện giọng nói của trình duyệt không kết nối được. Web Speech có thể cần Internet.'
    case 'language-not-supported':
      return 'Trình duyệt hiện không hỗ trợ nhận diện tiếng Việt.'
    case 'aborted':
      return 'Đã dừng nghe.'
    default:
      return 'Không thể nhận diện giọng nói lúc này. Hãy thử lại hoặc nhập tin nhắn.'
  }
}
