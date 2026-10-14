<script setup lang="ts">
import { nextTick, onUnmounted, ref } from 'vue'
import { generateBongReply, offlinePreviewReply } from '../lib/bong-chat'
import type { BongTurn } from '../lib/bong-chat'

interface DisplayTurn extends BongTurn {
  id: number
  demo: boolean
}
const mode = ref<'demo' | 'gemini'>('demo')
const input = ref('')
const apiKey = ref('') // Deliberately ephemeral; do NOT save to localStorage, URL or server.
const model = ref('gemini-2.5-flash-lite')
const messages = ref<DisplayTurn[]>([])
const error = ref('')
const busy = ref(false)
const listRef = ref<HTMLElement>()
let nextId = 0
let controller: AbortController | undefined

async function scrollToEnd() {
  await nextTick()
  listRef.value?.scrollTo({ top: listRef.value.scrollHeight, behavior: 'smooth' })
}

function selectMode(value: 'demo' | 'gemini') {
  if (busy.value)
    return
  mode.value = value
  error.value = ''
  messages.value = []
}

function clearConversation() {
  if (busy.value)
    return
  messages.value = []
  error.value = ''
}

async function sendMessage() {
  const text = input.value.trim()
  if (busy.value || !text)
    return
  if (mode.value === 'gemini' && !apiKey.value.trim()) {
    error.value = 'Nhập API key của bạn để trò chuyện bằng AI thật. Không cần khóa khi thử mô phỏng.'
    return
  }

  error.value = ''
  input.value = ''
  messages.value.push({ id: nextId++, role: 'user', text, demo: false })
  await scrollToEnd()

  if (mode.value === 'demo') {
    messages.value.push({ id: nextId++, role: 'model', text: offlinePreviewReply(text), demo: true })
    await scrollToEnd()
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
    })
    messages.value.push({ id: nextId++, role: 'model', text: reply, demo: false })
    await scrollToEnd()
  }
  catch (err) {
    error.value = controller?.signal.aborted
      ? 'Yêu cầu quá thời gian 35 giây. Hãy thử lại.'
      : (err instanceof Error ? err.message : 'Không thể kết nối AI.')
    // Never print the API key, raw response or untrusted request to the console.
  }
  finally {
    clearTimeout(timeout)
    controller = undefined
    busy.value = false
  }
}

onUnmounted(() => {
  controller?.abort()
  apiKey.value = ''
})
</script>

<template>
  <section class="bong-chat flex flex-col overflow-hidden" aria-label="Hội thoại BÔNG" data-testid="bong-text-chat">
    <div class="bong-chat-head flex flex-col gap-2">
      <div class="flex items-center justify-between gap-2">
        <div>
          <div class="text-sm font-semibold">Trò chuyện với BÔNG</div>
          <div class="text-xs opacity-70">Giai đoạn 2 · Văn bản</div>
        </div>
        <button
          class="bong-clear rounded-lg px-3 py-1 text-xs"
          type="button"
          :disabled="busy"
          data-testid="bong-chat-clear"
          @click="clearConversation"
        >
          Xóa chat
        </button>
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
      <div v-if="mode === 'gemini'" class="flex flex-col gap-2 text-xs">
        <label for="bong-gemini-key" class="font-medium">API key cá nhân (chỉ lưu trong tab này)</label>
        <input
          id="bong-gemini-key"
          v-model="apiKey"
          class="bong-input rounded-lg px-3 py-2"
          type="password"
          autocomplete="off"
          spellcheck="false"
          placeholder="Dán Gemini API key của bạn"
          data-testid="bong-api-key"
          aria-label="Gemini API key cá nhân"
        >
        <div class="flex items-center gap-2">
          <label class="font-medium" for="bong-gemini-model">Mô hình</label>
          <select id="bong-gemini-model" v-model="model" class="bong-input min-w-0 flex-1 rounded-lg px-2 py-2" data-testid="bong-model">
            <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash-Lite</option>
            <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
          </select>
        </div>
        <p class="opacity-75">BÔNG chỉ gửi tin nhắn và key trực tiếp tới Google API. Hạn mức và phí (nếu có) phụ thuộc tài khoản Google của bạn; BÔNG không tự bật dịch vụ trả phí.</p>
      </div>
      <p v-else class="text-xs opacity-75" data-testid="bong-demo-notice">
        Chế độ mô phỏng miễn phí: phản hồi mẫu, <strong>không phải trí tuệ nhân tạo</strong>.
      </p>
    </div>

    <div ref="listRef" class="bong-messages min-h-0 flex-1 overflow-y-auto px-4 py-4" role="log" aria-live="polite" data-testid="bong-chat-messages">
      <p v-if="messages.length === 0" class="bong-welcome text-sm">
        Xin chào! Nhập lời chào để thử giao diện, hoặc chọn AI thật để kết nối Gemini.
      </p>
      <div
        v-for="item in messages"
        :key="item.id"
        class="my-3 flex"
        :class="item.role === 'user' ? 'justify-end' : 'justify-start'"
      >
        <div class="bong-bubble rounded-xl px-3 py-2 text-sm" :class="item.role === 'user' ? 'sent' : 'received'">
          <div v-if="item.demo" class="mb-1 text-xs font-semibold opacity-75">Phản hồi mô phỏng · không phải AI</div>
          <span class="whitespace-pre-wrap break-words">{{ item.text }}</span>
        </div>
      </div>
      <p v-if="busy" class="text-sm" data-testid="bong-chat-busy">BÔNG đang chờ Gemini trả lời...</p>
    </div>

    <div class="bong-chat-foot flex flex-col gap-2">
      <p v-if="error" role="alert" class="bong-error rounded-lg px-3 py-2 text-xs" data-testid="bong-chat-error">{{ error }}</p>
      <form class="flex gap-2" @submit.prevent="sendMessage">
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
          :disabled="busy || !input.trim()"
          data-testid="bong-chat-send"
        >
          Gửi
        </button>
      </form>
      <div class="text-xs opacity-65">Phiên chat chỉ lưu tạm trong trang đang mở. Chưa tích hợp micro và giọng Mai Chi.</div>
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
.bong-chat-head, .bong-chat-foot { padding: 14px; background: #eefaff; }
.bong-chat-head { border-bottom: 1px solid #d1e7ef; }
.bong-chat-foot { border-top: 1px solid #d1e7ef; }
.bong-tab, .bong-clear { background: #e1eaf0; color: #314258; }
.bong-tab.active { background: #158bb2; color: white; }
.bong-input { width: 100%; color: #23394b; background: white; border: 1px solid #c4dae4; outline-color: #1590b2; }
.bong-input:focus { outline: 2px solid #87cae2; }
.bong-send { background: #128eb3; color: white; }
.bong-send:disabled { cursor: not-allowed; opacity: .55; }
.bong-messages { background: rgba(255,255,255,.55); }
.bong-bubble { max-width: 88%; overflow-wrap: anywhere; }
.bong-bubble.sent { background: #d7f4fd; }
.bong-bubble.received { background: #f0e9ff; }
.bong-welcome { color: #526b7a; }
.bong-error { color: #96333e; background: #ffe7ea; }
@media (max-width: 767px) {
  .bong-chat { border-radius: 15px; max-height: 65dvh; }
  .bong-chat-head, .bong-chat-foot { padding: 10px; }
}
</style>
