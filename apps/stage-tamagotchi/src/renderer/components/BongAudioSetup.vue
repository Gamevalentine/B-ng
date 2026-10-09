<script setup lang="ts">
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

const hearing = useHearingStore()
const speech = useSpeechStore()
const { activeSpeechProvider, activeSpeechVoiceId } = storeToRefs(speech)
const { activeTranscriptionProvider } = storeToRefs(hearing)
const supportsMicrophone = ref(false)
const vietnameseSystemVoices = ref(0)
const isCheckingMicrophone = ref(false)
const microphoneResult = ref('')

const speechConfigured = computed(() => !!activeSpeechProvider.value && activeSpeechProvider.value !== 'speech-noop')
const hearingStatusLabel = computed(() => {
  switch (activeTranscriptionProvider.value) {
    case 'official-provider-transcription':
      return 'Nhà cung cấp mặc định (chưa kiểm thử tiếng Việt)'
    case 'sherpaw-transcription':
      return 'Sherpaw cục bộ (cần kiểm tra mô hình đã tải)'
    case 'browser-web-speech-api':
      return 'Web Speech API (không bảo đảm hoạt động trên Electron)'
    case '':
      return 'Chưa chọn nhà cung cấp phiên âm'
    default:
      return 'Đã chọn nhà cung cấp; chưa kiểm thử tiếng Việt'
  }
})

function refreshAudioCapabilities() {
  supportsMicrophone.value = typeof navigator.mediaDevices?.getUserMedia === 'function'
  vietnameseSystemVoices.value = typeof window.speechSynthesis?.getVoices === 'function'
    ? window.speechSynthesis.getVoices().filter(voice => voice.lang.toLowerCase().startsWith('vi')).length
    : 0
}

onMounted(() => {
  refreshAudioCapabilities()
  window.speechSynthesis?.addEventListener('voiceschanged', refreshAudioCapabilities)
})
onUnmounted(() => {
  window.speechSynthesis?.removeEventListener('voiceschanged', refreshAudioCapabilities)
})

async function checkMicrophonePermission() {
  if (isCheckingMicrophone.value)
    return

  if (!supportsMicrophone.value) {
    microphoneResult.value = 'Máy không cung cấp API kiểm tra micro.'
    return
  }

  isCheckingMicrophone.value = true
  microphoneResult.value = 'Đang xin quyền kiểm tra micro...'
  let stream: MediaStream | undefined
  try {
    // Only runs on the user's click. Do not read, record, transcribe or upload
    // audio. Release the stream immediately after verifying an active track.
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    const activeTrack = stream.getAudioTracks().find(track => track.readyState === 'live')
    microphoneResult.value = activeTrack
      ? 'Micro hoạt động và đã được thả ngay sau khi kiểm tra. Chưa thu âm hoặc gửi dữ liệu.'
      : 'Windows cấp quyền nhưng chưa tìm thấy đường âm thanh hoạt động.'
  }
  catch (error) {
    const name = error instanceof Error ? error.name : ''
    microphoneResult.value = name === 'NotAllowedError' || name === 'PermissionDeniedError'
      ? 'Chưa được cấp quyền micro. Anh có thể cho phép trong Cài đặt quyền riêng tư của Windows.'
      : 'Không thể mở micro. Hãy kiểm tra thiết bị âm thanh và quyền truy cập của Windows.'
  }
  finally {
    stream?.getTracks().forEach(track => track.stop())
    isCheckingMicrophone.value = false
  }
}
</script>

<template>
  <section class="border border-blue-100 rounded-xl bg-blue-50/50 p-4 text-slate-800 dark:border-blue-900 dark:bg-slate-900 dark:text-slate-100" aria-label="Thiết lập âm thanh BÔNG">
    <h2 class="mb-1 text-lg font-semibold">
      Nghe và nói tiếng Việt
    </h2>
    <p class="mb-3 text-sm opacity-80">
      Thiết lập từng phần, chỉ bật micro khi anh yêu cầu. Không tự gửi tin nhắn.
    </p>
    <div class="grid gap-2 text-sm">
      <p>
        <strong>Nghe:</strong>
        {{ hearingStatusLabel }}
      </p>
      <p>
        <strong>Giọng đọc đang dùng:</strong>
        {{ speechConfigured ? activeSpeechVoiceId || activeSpeechProvider : 'Chưa chọn' }}
      </p>
      <p>
        <strong>Giọng tiếng Việt có sẵn trên Windows:</strong>
        {{ vietnameseSystemVoices }}.
        <span v-if="vietnameseSystemVoices === 0">Chưa thể dùng giọng nữ Việt cục bộ của Windows.</span>
      </p>
    </div>
    <div class="mt-4 flex flex-wrap gap-2">
      <RouterLink
        to="/settings/modules/hearing"
        class="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white font-medium transition-colors hover:bg-blue-700"
      >
        Thiết lập nhận diện giọng nói
      </RouterLink>
      <button
        type="button"
        class="border border-blue-200 rounded-lg bg-white px-3 py-2 text-sm text-slate-800 font-medium transition-colors dark:border-slate-600 dark:bg-slate-800 hover:bg-blue-50 dark:text-slate-100 disabled:opacity-50"
        :disabled="!supportsMicrophone || isCheckingMicrophone"
        @click="checkMicrophonePermission"
      >
        {{ isCheckingMicrophone ? 'Đang kiểm tra...' : 'Kiểm tra micro một lần' }}
      </button>
      <RouterLink
        to="/settings/modules/speech"
        class="border border-blue-200 rounded-lg px-3 py-2 text-sm text-blue-700 font-medium dark:border-blue-800 dark:text-blue-300"
      >
        Chọn giọng đọc
      </RouterLink>
    </div>
    <p v-if="microphoneResult" class="mt-2 text-sm" role="status">
      {{ microphoneResult }}
    </p>
    <p class="mt-3 text-xs opacity-65">
      BÔNG chạy trong Electron: Web Speech API có thể hiện diện nhưng không hoạt động ổn định do thiếu khóa trình duyệt. Sherpaw có mô hình Zipformer hỗ trợ tiếng Việt; cần kiểm tra dung lượng và vị trí lưu trên ổ E trước khi tải. Nút kiểm tra micro chỉ xin quyền một lần, không lưu âm thanh.
    </p>
  </section>
</template>
