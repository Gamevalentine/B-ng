import type { Ref } from 'vue'

import { computed, ref } from 'vue'

import { useStopSpeakingButton } from './useStopSpeakingButton'

/**
 * BÔNG migration compatibility only. The Windows source in the ZIP uses the
 * newer chat interruption API, but this older layout package still owns the
 * legacy audio-only stop button. Do not claim true LLM turn cancellation here.
 * Replace with the exact current Windows implementation before release.
 */
export interface ChatInterruptionOptions {
  sessionId: Readonly<Ref<string>>
  generating: Readonly<Ref<boolean>>
  hasSubmission: Readonly<Ref<boolean>>
  submit: (hooks?: ChatInterruptionSubmissionHooks) => Promise<void>
}

interface ChatInterruptionSubmissionHooks {
  beforeSend: (sessionId: string) => Promise<void>
  afterSendStarted: (sessionId: string) => void
}

export function useChatInterruption(options: ChatInterruptionOptions) {
  const { stopSpeakingFromChat } = useStopSpeakingButton()
  const preparingReplacement = ref(false)
  const responseActive = computed(() => options.generating.value)
  const showStopAction = computed(() =>
    responseActive.value && !options.hasSubmission.value && !preparingReplacement.value,
  )

  async function stopActiveResponse() {
    // Existing BÔNG UI can stop audio playback. The legacy store does not
    // expose the new cross-session active-turn cancellation receipt.
    stopSpeakingFromChat()
  }

  async function submitInterruptingResponse() {
    if (preparingReplacement.value)
      return

    if (!responseActive.value) {
      await options.submit()
      return
    }

    preparingReplacement.value = true
    try {
      await options.submit({
        beforeSend: async () => { stopSpeakingFromChat() },
        afterSendStarted: () => { preparingReplacement.value = false },
      })
    }
    finally {
      preparingReplacement.value = false
    }
  }

  return {
    responseActive,
    showStopAction,
    stopActiveResponse,
    submitInterruptingResponse,
  }
}
