import { z } from 'zod'

import { defineProvider } from '../../registry'

const baseURL = 'https://bong-tts.invalid/v1/'
const ttsURL = 'airi-bong-tts://local/v1/audio/speech'

export const providerBongZeroTts = defineProvider({
  id: 'bong-zerotts-local',
  name: 'BÔNG – Mai Chi (offline)',
  nameLocalize: () => 'BÔNG – Mai Chi (offline)',
  description: 'Giọng nữ Mai Chi dùng ZeroTTS, chạy trên máy Windows.',
  descriptionLocalize: () => 'Giọng nữ Mai Chi dùng ZeroTTS, chạy trên máy Windows.',
  tasks: ['text-to-speech', 'tts'],
  icon: 'i-solar:volume-loud-bold-duotone',
  requiresCredentials: false,
  createProviderConfig: () => z.object({}),
  createProvider() {
    return {
      speech: (model: string) => ({
        model,
        baseURL,
        apiKey: 'local-offline-voice',
        // Electron main handles this private scheme; no external HTTP requests.
        fetch: async (_input: RequestInfo | URL, init?: RequestInit) =>
          await globalThis.fetch(ttsURL, init),
      }),
    }
  },
  validationRequiredWhen: () => false,
  extraMethods: {
    listModels: async () => [{
      id: 'zerotts-maichi',
      name: 'ZeroTTS – Mai Chi (CPU)',
      provider: 'bong-zerotts-local',
      description: 'TTS tiếng Việt offline; yêu cầu worker Python cài sẵn.',
      contextLength: 0,
      deprecated: false,
    }],
    listVoices: async () => [{
      id: 'vi-VN-maichi',
      name: 'Mai Chi – Nữ trẻ',
      provider: 'bong-zerotts-local',
      languages: [{ code: 'vi-VN', title: 'Tiếng Việt' }],
      gender: 'female' as const,
    }],
  },
})
