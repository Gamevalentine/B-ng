<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { appendSpokenText, createVietnameseRecognizer, extractVietnameseTranscript, resolveVietnameseRecognition, voiceRecognitionError } from '../lib/bong-speech'
import type { BrowserSpeechRecognition } from '../lib/bong-speech'
import { DEFAULT_GEMINI_MODEL, generateBongReply, offlinePreviewReply } from '../lib/bong-chat'
import type { BongTurn } from '../lib/bong-chat'
import { BONG_SYSTEM_VOICE, BONG_TTS_NOTICE, chooseVietnameseVoice, clampBongSpeechRate, prepareVietnameseSpeech } from '../lib/bong-tts-browser'
import { BONG_GEMINI_VOICES, generateGeminiBongWav } from '../lib/bong-gemini-tts'

interface DisplayTurn extends BongTurn {
  id: number
  demo: boolean
}
const mode = ref<'demo' | 'gemini'>('demo')
const settingsExpanded = ref(false)
const input = ref('')
const apiKey = ref('') // Deliberately ephemeral; do NOT save to localStorage, URL or server.
const model = ref(DEFAULT_GEMINI_MODEL)
const connected = ref(false)
const messages = ref<DisplayTurn[]>([])
const error = ref('')
const retryNotice = ref('')
const busy = ref(false)
const listRef = ref<HTMLElement>()
const browserTtsSupported = ref(false)
const vietnameseVoices = ref<{ uri: string, name: string, lang: string }[]>([])
const selectedVoiceURI = ref(BONG_SYSTEM_VOICE)
const systemVoiceSelectedManually = ref(false)
const autoReadAloud = ref(false)
const ttsEngine = ref<'gemini' | 'browser'>('gemini')
const geminiTtsVoice = ref('Leda')
const ttsRate = ref(1)
const ttsStatus = ref('')
const speakingMessageId = ref<number | null>(null)
let currentUtterance: SpeechSynthesisUtterance | undefined
let currentAudio: HTMLAudioElement | undefined
let currentAudioURL: string | undefined
let voiceAbortController: AbortController | undefined
let ttsGeneration = 0

function refreshVietnameseVoices() {
  if (!browserTtsSupported.value)
    return
  const voices = window.speechSynthesis.getVoices().filter(v => /^vi(?:-|$)/i.test(v.lang))
  vietnameseVoices.value = voices.map(v => ({ uri: v.voiceURI, name: v.name, lang: v.lang }))
  if (selectedVoiceURI.value !== BONG_SYSTEM_VOICE && !voices.some(v => v.voiceURI === selectedVoiceURI.value))
    selectedVoiceURI.value = voices[0]?.voiceURI ?? BONG_SYSTEM_VOICE
  if (selectedVoiceURI.value === BONG_SYSTEM_VOICE && voices.length && !systemVoiceSelectedManually.value)
    selectedVoiceURI.value = voices[0]?.voiceURI ?? BONG_SYSTEM_VOICE
}

function stopBongSpeech() {
  ttsGeneration++
  voiceAbortController?.abort()
  voiceAbortController = undefined
  currentUtterance = undefined
  currentAudio?.pause()
  currentAudio = undefined
  if (currentAudioURL)
    URL.revokeObjectURL(currentAudioURL)
  currentAudioURL = undefined
  speakingMessageId.value = null
  if (browserTtsSupported.value)
    window.speechSynthesis.cancel()
}

async function speakBongText(text: string, id: number) {
  if (speakingMessageId.value === id) {
    stopBongSpeech()
    ttsStatus.value = 'Đã dừng đọc.'
    return
  }
  stopBongSpeech()
  const clean = prepareVietnameseSpeech(text)
  if (!clean) {
    ttsStatus.value = 'Tin nhắn không có nội dung phù hợp để đọc.'
    return
  }
  if (ttsEngine.value === 'gemini') {
    if (mode.value !== 'gemini' || !apiKey.value.trim()) {
      ttsStatus.value = 'Hãy chọn AI thật và nhập Gemini API key trong ⚙ Cài đặt để thử giọng nữ tiếng Việt.'
      return
    }
    // Explicit click or auto-read opt-in only. Never auto-bill or retry failed TTS.
    releaseSpeechRecognition()
    const generation = ++ttsGeneration
    const abort = new AbortController()
    voiceAbortController = abort
    speakingMessageId.value = id
    ttsStatus.value = 'Gemini đang tạo giọng tiếng Việt...'
    try {
      const wav = await generateGeminiBongWav({
        text: clean,
        key: apiKey.value,
        voice: geminiTtsVoice.value,
        signal: abort.signal,
      })
      if (generation !== ttsGeneration || abort.signal.aborted)
        return
      const wavBytes = new Uint8Array(wav)
      const url = URL.createObjectURL(new Blob([wavBytes], { type: 'audio/wav' }))
      currentAudioURL = url
      const player = new Audio(url)
      currentAudio = player
      player.onended = () => {
        if (generation !== ttsGeneration) return
        stopBongSpeech()
        ttsStatus.value = 'Đã đọc xong.'
      }
      player.onerror = () => {
        if (generation !== ttsGeneration) return
        stopBongSpeech()
        ttsStatus.value = 'Trình duyệt không phát được âm thanh Gemini.'
      }
      await player.play()
      if (generation === ttsGeneration)
        ttsStatus.value = 'Đang đọc bằng giọng AI tiếng Việt (chưa phải Mai Chi).'
    }
    catch (err) {
      if (generation !== ttsGeneration) return
      const message = err instanceof Error ? err.message : 'Không tạo được giọng AI.'
      stopBongSpeech()
      ttsStatus.value = message
    }
    finally {
      if (voiceAbortController === abort)
        voiceAbortController = undefined
    }
    return
  }
  if (!browserTtsSupported.value) {
    ttsStatus.value = 'Trình duyệt không hỗ trợ giọng đọc hệ thống.'
    return
  }
  refreshVietnameseVoices()
  const useSystemDefault = selectedVoiceURI.value === BONG_SYSTEM_VOICE
  const voice = useSystemDefault ? undefined : chooseVietnameseVoice(window.speechSynthesis.getVoices(), selectedVoiceURI.value)
  if (!voice && !useSystemDefault) {
    ttsStatus.value = 'Không tìm thấy giọng tiếng Việt trên Chrome.'
    return
  }
  const generation = ++ttsGeneration
  try {
    const utterance = new SpeechSynthesisUtterance(clean)
    utterance.lang = 'vi-VN'
    // An unassigned voice lets Chrome attempt the system default (Vietnamese may be inaccurate).
    if (voice)
      utterance.voice = voice
    utterance.rate = clampBongSpeechRate(ttsRate.value)
    utterance.pitch = 1
    currentUtterance = utterance
    utterance.onstart = () => {
      if (ttsGeneration !== generation) return
      speakingMessageId.value = id
      ttsStatus.value = useSystemDefault ? 'Đang thử giọng hệ thống; tiếng Việt có thể chưa chuẩn.' : 'BÔNG đang đọc...'
    }
    utterance.onend = () => {
      if (ttsGeneration !== generation) return
      speakingMessageId.value = null
      currentUtterance = undefined
      ttsStatus.value = 'Đã đọc xong.'
    }
    utterance.onerror = () => {
      if (ttsGeneration !== generation) return
      speakingMessageId.value = null
      currentUtterance = undefined
      ttsStatus.value = 'Không phát được giọng nói. Hãy chọn giọng khác hoặc thử lại.'
    }
    // Never record the microphone while the browser is reading aloud.
    releaseSpeechRecognition()
    window.speechSynthesis.speak(utterance)
  }
  catch {
    speakingMessageId.value = null
    currentUtterance = undefined
    ttsStatus.value = 'Trình duyệt không phát được âm thanh tiếng Việt.'
  }
}

function speakBongMessage(item: DisplayTurn) {
  if (item.role !== 'model') return
  speakBongText(item.text, item.id)
}

function maybeReadBongReply(item: DisplayTurn) {
  if (autoReadAloud.value)
    speakBongText(item.text, item.id)
}

const microphoneSupported = ref(false)
const listening = ref(false)
const interimTranscript = ref('')
const speechStatus = ref('')
let recognition: BrowserSpeechRecognition | undefined
let spokenInputBase = ''
let receivedFinal = false
onMounted(() => {
  microphoneSupported.value = !!resolveVietnameseRecognition()
  browserTtsSupported.value = typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance === 'function'
  if (browserTtsSupported.value) {
    refreshVietnameseVoices()
    window.speechSynthesis.addEventListener?.('voiceschanged', refreshVietnameseVoices)
  }
})

function releaseSpeechRecognition() {
  const current = recognition
  recognition = undefined
  if (current) {
    current.onstart = null
    current.onresult = null
    current.onerror = null
    current.onend = null
    try { current.abort() } catch { /* Recognition may already be stopped. */ }
  }
  listening.value = false
  interimTranscript.value = ''
}

function toggleMicrophone() {
  if (busy.value)
    return
  if (!recognition && speakingMessageId.value !== null) stopBongSpeech()
  if (recognition) {
    // Stop recording; the browser may deliver a final result before onend.
    try {
      recognition.stop()
      speechStatus.value = 'Đang hoàn tất nhận diện...'
    }
    catch {
      releaseSpeechRecognition()
      speechStatus.value = 'Đã dừng nghe.'
    }
    return
  }

  let current: BrowserSpeechRecognition
  try {
    current = createVietnameseRecognizer()
  }
  catch (err) {
    speechStatus.value = err instanceof Error ? err.message : 'Không khởi động được micro.'
    return
  }
  recognition = current
  spokenInputBase = input.value
  receivedFinal = false
  speechStatus.value = 'Đang yêu cầu quyền micro...'
  current.onstart = () => {
    if (recognition !== current)
      return
    listening.value = true
    speechStatus.value = 'Đang nghe tiếng Việt... Hãy nói rồi chờ BÔNG chuyển thành chữ.'
  }
  current.onresult = (event) => {
    if (recognition !== current)
      return
    const transcript = extractVietnameseTranscript(event)
    interimTranscript.value = transcript.interim
    if (transcript.final) {
      receivedFinal = true
      input.value = appendSpokenText(spokenInputBase, transcript.final)
      speechStatus.value = 'Đã nhận diện tiếng Việt. Kiểm tra văn bản rồi bấm Gửi.'
    }
  }
  current.onerror = (event) => {
    if (recognition !== current)
      return
    const message = voiceRecognitionError(event.error)
    releaseSpeechRecognition()
    speechStatus.value = message
  }
  current.onend = () => {
    if (recognition !== current)
      return
    recognition = undefined
    listening.value = false
    interimTranscript.value = ''
    if (!receivedFinal)
      speechStatus.value = 'Chưa nhận được văn bản. Bạn có thể nói lại hoặc nhập bằng bàn phím.'
  }

  try {
    current.start() // The only microphone start is from a direct user click.
  }
  catch {
    releaseSpeechRecognition()
    speechStatus.value = 'Không thể bật micro. Kiểm tra quyền micro của Chrome rồi thử lại.'
  }
}

let nextId = 0
let controller: AbortController | undefined

async function scrollToEnd() {
  await nextTick()
  listRef.value?.scrollTo({ top: listRef.value.scrollHeight, behavior: 'smooth' })
}

function selectMode(value: 'demo' | 'gemini') {
  if (busy.value)
    return
  stopBongSpeech()
  ttsStatus.value = ''
  releaseSpeechRecognition()
  speechStatus.value = ''
  mode.value = value
  if (value === 'gemini' && !apiKey.value.trim())
    settingsExpanded.value = true
  error.value = ''
  retryNotice.value = ''
  connected.value = false
  messages.value = []
}

function clearConversation() {
  if (busy.value)
    return
  stopBongSpeech()
  ttsStatus.value = ''
  releaseSpeechRecognition()
  speechStatus.value = ''
  messages.value = []
  error.value = ''
  retryNotice.value = ''
  connected.value = false
}

async function sendMessage() {
  if (recognition) {
    speechStatus.value = 'Vui lòng dừng micro và chờ nhận diện xong trước khi gửi.'
    return
  }
  const text = input.value.trim()
  if (busy.value || !text)
    return
  if (mode.value === 'gemini' && !apiKey.value.trim()) {
    error.value = 'Nhập API key của bạn để trò chuyện bằng AI thật. Không cần khóa khi thử mô phỏng.'
    return
  }

  stopBongSpeech()
  error.value = ''
  retryNotice.value = ''
  input.value = ''
  const userMessageId = nextId++
  messages.value.push({ id: userMessageId, role: 'user', text, demo: false })
  await scrollToEnd()

  if (mode.value === 'demo') {
    const demoReply: DisplayTurn = { id: nextId++, role: 'model', text: offlinePreviewReply(text), demo: true }
    messages.value.push(demoReply)
    await scrollToEnd()
    maybeReadBongReply(demoReply)
    return
  }

  busy.value = true
  controller = new AbortController()
  const timeout = setTimeout(() => controller?.abort(), 35000)
  try {
    const reply = await generateBongReply({
      apiKey: apiKey.value,
      model: model.value,
      history: messages.value.filter(item => !item.demo).map(({ role, text }) => ({ role, text })),
      signal: controller.signal,
      onRetry: (status) => {
        retryNotice.value = `Gemini trả về HTTP ${status}. BÔNG đang đợi ngắn và thử lại đúng một lần...`
      },
    })
    const aiReply: DisplayTurn = { id: nextId++, role: 'model', text: reply, demo: false }
    messages.value.push(aiReply)
    connected.value = true
    await scrollToEnd()
    maybeReadBongReply(aiReply)
  }
  catch (err) {
    connected.value = false
    // A failed user turn must not poison the provider history or get silently lost.
    messages.value = messages.value.filter(item => item.id !== userMessageId)
    input.value = text
    error.value = controller?.signal.aborted
      ? 'Yêu cầu quá thời gian 35 giây. Hãy thử lại.'
      : (err instanceof Error ? err.message : 'Không thể kết nối AI.')
    // Never print the API key, raw response or untrusted request to the console.
  }
  finally {
    clearTimeout(timeout)
    retryNotice.value = ''
    controller = undefined
    busy.value = false
  }
}

onUnmounted(() => {
  stopBongSpeech()
  if (browserTtsSupported.value)
    window.speechSynthesis.removeEventListener?.('voiceschanged', refreshVietnameseVoices)
  releaseSpeechRecognition()
  controller?.abort()
  apiKey.value = ''
})
</script>

<template>
  <section class="bong-chat flex flex-col overflow-hidden" aria-label="Hội thoại BÔNG" data-testid="bong-text-chat">
    <div class="bong-chat-head flex flex-col gap-2">
      <div class="flex items-center justify-between gap-2">
        <strong class="text-sm">BÔNG <span class="font-normal opacity-60">· Trò chuyện</span></strong>
        <div class="flex items-center gap-1">
          <button type="button" class="bong-clear rounded-lg px-2 py-1 text-xs"
            data-testid="bong-settings-toggle" :aria-expanded="settingsExpanded"
            @click="settingsExpanded = !settingsExpanded">{{ settingsExpanded ? 'Ẩn cài đặt' : '⚙ Cài đặt' }}</button>
          <button type="button" class="bong-clear rounded-lg px-2 py-1 text-xs"
            :disabled="busy" data-testid="bong-chat-clear" @click="clearConversation">Xóa</button>
        </div>
      </div>
      <div class="flex gap-2" role="group" aria-label="Chế độ hội thoại">
        <button
          type="button"
          class="bong-tab flex-1 rounded-lg px-2 py-2 text-xs"
          :class="{ active: mode === 'demo' }"
          :aria-pressed="mode === 'demo'"
          data-testid="bong-mode-demo"
          :disabled="busy"
          @click="selectMode('demo')"
        >
          Thử giao diện
        </button>
        <button
          type="button"
          class="bong-tab flex-1 rounded-lg px-2 py-2 text-xs"
          :class="{ active: mode === 'gemini' }"
          :aria-pressed="mode === 'gemini'"
          data-testid="bong-mode-gemini"
          :disabled="busy"
          @click="selectMode('gemini')"
        >
          AI thật · Gemini
        </button>
      </div>
      <div v-if="settingsExpanded" class="bong-settings flex flex-col gap-2 text-xs" data-testid="bong-expanded-settings">
        <div v-if="mode === 'gemini'" class="flex flex-col gap-2">
          <label for="bong-gemini-key" class="font-medium">API key Gemini · chỉ trong tab</label>
          <input id="bong-gemini-key" v-model="apiKey" type="password" autocomplete="off"
            spellcheck="false" placeholder="Gemini API key cá nhân"
            class="bong-input rounded-lg px-3 py-2" data-testid="bong-api-key" aria-label="Gemini API key cá nhân">
          <label for="bong-gemini-model">Mô hình</label>
          <select id="bong-gemini-model" v-model="model" class="bong-input rounded-lg px-2 py-2" data-testid="bong-model">
            <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash-Lite</option>
            <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash-Lite</option>
            <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash-Lite</option>
            <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
          </select>
          <div class="flex justify-between gap-2">
            <a class="underline" href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">Lấy key ↗</a>
            <span v-if="connected" class="text-green-700" data-testid="bong-ai-connected">AI đã trả lời</span>
            <span v-else class="opacity-70" data-testid="bong-ai-unverified">Chưa kết nối</span>
          </div>
          <details class="opacity-75">
            <summary class="cursor-pointer">Quyền riêng tư và hạn mức API</summary>
            Key được gửi từ trình duyệt tới Google và có thể xem trong công cụ mạng. Dùng key có hạn mức; không bật thanh toán nếu muốn miễn phí. BÔNG thử lại tối đa một lần khi gặp lỗi 5xx, có thể tính vào hạn mức, không tự đổi mô hình.
          </details>
        </div>
        <div class="flex flex-col gap-2 rounded-lg bg-white/70 p-2" data-testid="bong-tts-settings">
          <div class="flex items-center justify-between">
            <strong>Giọng đọc</strong>
            <button type="button" class="bong-clear rounded px-2 py-1" data-testid="bong-tts-refresh" @click="refreshVietnameseVoices">Tải lại</button>
          </div>
          <div class="flex items-center gap-2">
            <select id="bong-tts-voice" v-model="selectedVoiceURI" class="bong-input min-w-0 flex-1 rounded-lg px-2 py-1"
              aria-label="Chọn giọng đọc" data-testid="bong-tts-voice" :disabled="!browserTtsSupported" @change="systemVoiceSelectedManually = selectedVoiceURI === BONG_SYSTEM_VOICE; stopBongSpeech()">
              <option :value="BONG_SYSTEM_VOICE">Giọng hệ thống (thử nghiệm)</option>
              <option v-for="voice in vietnameseVoices" :key="voice.uri" :value="voice.uri">{{ voice.name }} ({{ voice.lang }})</option>
            </select>
            <select id="bong-tts-rate" v-model.number="ttsRate" class="bong-input w-auto rounded-lg px-1 py-1"
              aria-label="Tốc độ đọc" data-testid="bong-tts-rate">
              <option :value="0.9">0.9×</option>
              <option :value="1">1×</option>
              <option :value="1.1">1.1×</option>
            </select>
          </div>
          <label class="flex items-center gap-2">
            <input v-model="autoReadAloud" type="checkbox" data-testid="bong-tts-auto" :disabled="!browserTtsSupported"> Tự đọc sau khi trả lời
          </label>
          <p v-if="vietnameseVoices.length === 0" class="text-amber-800" data-testid="bong-tts-unavailable">
            Chưa có giọng vi-VN; có thể thử giọng hệ thống nhưng phát âm không chuẩn.
          </p>
          <details class="opacity-70" data-testid="bong-tts-disclaimer">
            <summary class="cursor-pointer">Giới hạn giọng đọc</summary>{{ BONG_TTS_NOTICE }}
          </details>
        </div>
        <details class="opacity-70">
          <summary class="cursor-pointer">Micro và quyền riêng tư</summary>
          Web Speech có thể dùng dịch vụ của Chrome. Chưa phải Sherpa offline; giọng đọc chưa phải Mai Chi và chưa đồng bộ miệng.
        </details>
      </div>
      <p v-if="mode === 'gemini' && !apiKey.trim() && !settingsExpanded" class="text-xs opacity-70">
        Bấm ⚙ Cài đặt để nhập Gemini API key.
      </p>
    </div>

    <div ref="listRef" class="bong-messages min-h-0 flex-1 overflow-y-auto px-4 py-4" role="log" aria-live="polite" data-testid="bong-chat-messages">
      <p v-if="messages.length === 0" class="bong-welcome text-sm">Chào bạn! BÔNG đang nghe đây.</p>
      <div
        v-for="item in messages"
        :key="item.id"
        class="my-3 flex"
        :class="item.role === 'user' ? 'justify-end' : 'justify-start'"
      >
        <div class="bong-bubble rounded-xl px-3 py-2 text-sm" :class="item.role === 'user' ? 'sent' : 'received'">
          <div v-if="item.demo" class="mb-1 text-xs font-semibold opacity-75">Phản hồi mô phỏng · không phải AI</div>
          <span class="whitespace-pre-wrap break-words">{{ item.text }}</span>
          <div v-if="item.role === 'model'" class="mt-2 flex items-center gap-2">
            <button
              type="button" class="bong-read rounded-lg px-2 py-1 text-xs"
              :aria-label="speakingMessageId === item.id ? 'Dừng đọc tin nhắn BÔNG' : 'Đọc tin nhắn BÔNG'"
              data-testid="bong-tts-speak"
              @click="speakBongMessage(item)"
            >{{ speakingMessageId === item.id ? '■ Dừng đọc' : '🔊 Nghe BÔNG đọc' }}</button>
          </div>
        </div>
      </div>
      <p v-if="busy" class="text-sm" data-testid="bong-chat-busy">BÔNG đang chờ Gemini trả lời...</p>
    </div>

    <div class="bong-chat-foot flex flex-col gap-2">
      <p v-if="error" role="alert" class="bong-error rounded-lg px-3 py-2 text-xs" data-testid="bong-chat-error">{{ error }}</p>
      <p v-if="retryNotice" role="status" class="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800" data-testid="bong-gemini-retry-notice">{{ retryNotice }}</p>
      <p v-if="speechStatus" role="status" class="text-xs" data-testid="bong-speech-status">{{ speechStatus }}</p>
      <p v-if="interimTranscript" class="text-xs opacity-75" data-testid="bong-speech-interim">Đang nhận diện: {{ interimTranscript }}</p>
      <div v-if="ttsStatus" class="flex items-center justify-between gap-2 text-xs" data-testid="bong-tts-status" role="status">
        <span>{{ ttsStatus }}</span>
        <button v-if="speakingMessageId !== null" type="button" data-testid="bong-tts-stop" class="bong-clear rounded px-2 py-1" @click="stopBongSpeech">Dừng phát</button>
      </div>
      <form class="flex gap-2" @submit.prevent="sendMessage">
        <button
          type="button"
          class="bong-mic rounded-xl px-3 py-2 text-sm font-semibold"
          :class="{ listening }"
          :aria-pressed="listening"
          :aria-label="listening ? 'Dừng micro' : 'Bật micro tiếng Việt'"
          :title="microphoneSupported ? 'Nhấn để nhận diện tiếng Việt' : 'Web Speech có thể không khả dụng trong trình duyệt này'"
          :disabled="busy"
          data-testid="bong-speech-mic"
          @click="toggleMicrophone"
        >
          {{ listening ? 'Dừng' : '🎙' }}
        </button>
        <input
          v-model="input"
          aria-label="Nhập tin nhắn cho BÔNG"
          data-testid="bong-chat-input"
          class="bong-input min-w-0 flex-1 rounded-xl px-3 py-3 text-sm"
          type="text"
          placeholder="Nói gì đó với BÔNG..."
          maxlength="1200"
          :disabled="busy"
        >
        <button
          type="submit"
          class="bong-send rounded-xl px-4 py-2 text-sm font-semibold"
          :disabled="busy || !!recognition || !input.trim()"
          data-testid="bong-chat-send"
        >
          Gửi
        </button>
      </form>
      <div class="text-xs opacity-60" data-testid="bong-speech-disclaimer">🎙 Nói → kiểm tra chữ → Gửi · 🔊 Nghe thử (chưa phải Mai Chi)</div>
    </div>
  </section>
</template>

<style scoped>
.bong-chat {
  color: #293447;
  border: 1px solid #d1e7ef;
  border-radius: 18px;
  background: rgba(250, 253, 255, 0.97);
  box-shadow: 0 8px 38px rgba(26, 88, 112, 0.10);
  min-height: 280px;
  max-height: 88dvh;
  backdrop-filter: blur(14px);
}
.bong-chat-head, .bong-chat-foot { padding: 9px 12px; background: #eefaff; }
.bong-chat-head { border-bottom: 1px solid #d1e7ef; }
.bong-chat-foot { border-top: 1px solid #d1e7ef; }
.bong-settings { max-height: min(48dvh, 310px); overflow-y: auto; border-top: 1px solid #d1e7ef; padding-top: 7px; }
.bong-tab, .bong-clear { background: #e1eaf0; color: #314258; }
.bong-tab.active { background: #158bb2; color: white; }
.bong-input { width: 100%; color: #23394b; background: white; border: 1px solid #c4dae4; outline-color: #1590b2; }
.bong-input:focus { outline: 2px solid #87cae2; }
.bong-send { background: #128eb3; color: white; }
.bong-send:disabled { cursor: not-allowed; opacity: .55; }
.bong-read { background: #def0f7; color: #24536a; }
.bong-mic { background: #d7edf6; color: #244e64; white-space: nowrap; }
.bong-mic.listening { background: #b9e9d8; color: #176443; }
.bong-mic:disabled { opacity: .5; cursor: not-allowed; }
.bong-messages { background: rgba(255,255,255,.55); }
.bong-bubble { max-width: 88%; overflow-wrap: anywhere; }
.bong-bubble.sent { background: #d7f4fd; }
.bong-bubble.received { background: #f0e9ff; }
.bong-welcome { color: #526b7a; }
.bong-error { color: #96333e; background: #ffe7ea; }
@media (max-width: 767px) {
  .bong-chat { border-radius: 15px; max-height: 65dvh; }
  .bong-chat-head, .bong-chat-foot { padding: 8px 10px; }
}
</style>
