import { z } from 'zod'

import { defineProvider } from '../../registry'

export const providerBongPiper = defineProvider({
  id: 'bong-piper-local',
  name: 'BÔNG – Piper (offline)',
  nameLocalize: () => 'BÔNG – Piper (offline)',
  description: 'Giọng Việt Piper chạy trên Windows, giữ làm phương án dự phòng.',
  descriptionLocalize: () => 'Giọng Việt Piper chạy trên Windows, giữ làm phương án dự phòng.',
  tasks: ['text-to-speech', 'tts'],
  icon: 'i-solar:volume-loud-bold-duotone',
  requiresCredentials: false,
  createProviderConfig: () => z.object({}),
  createProvider() {
    return {
      speech: (model: string) => ({
        model,
        baseURL: 'https://bong-tts.invalid/v1/',
        apiKey: 'local-offline-voice',
        fetch: async (_input: RequestInfo | URL, init?: RequestInit) =>
          await globalThis.fetch('airi-bong-tts://local/v1/audio/speech', init),
      }),
    }
  },
  validationRequiredWhen: () => false,
  extraMethods: {
    listModels: async () => [{
      id: 'piper-vais1000-medium',
      name: 'Piper – Vietnamese VAIS1000',
      provider: 'bong-piper-local',
      description: 'TTS tiếng Việt offline với mô hình VAIS1000.',
      contextLength: 0,
      deprecated: false,
    }],
    voiceCatalogConfig: () => ({}),
    listVoices: async () => [{
      id: 'vi-VN-vais1000-medium',
      name: 'VAIS1000 – nữ',
      provider: 'bong-piper-local',
      languages: [{ code: 'vi-VN', title: 'Tiếng Việt' }],
      gender: 'female' as const,
    }],
  },
})
