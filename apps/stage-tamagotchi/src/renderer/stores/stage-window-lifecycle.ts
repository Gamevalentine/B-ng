import type { ElectronWindowLifecycleState } from '../../shared/eventa'

import { defineInvoke } from '@moeru/eventa'
import { getElectronEventaContext } from '@proj-airi/electron-vueuse'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { electronGetWindowLifecycleState, electronWindowClose, electronWindowLifecycleChanged } from '../../shared/eventa'
import { resolveInitialRendererRoutePath } from '../window-context'

const MAIN_STAGE_IDLE_HIDE_MS = 3 * 60 * 1000

export function createDefaultWindowLifecycleState(): ElectronWindowLifecycleState {
  return {
    focused: true,
    minimized: false,
    reason: 'initial',
    updatedAt: 0,
    visible: true,
  }
}

export function shouldPauseStageFromLifecycle(state: ElectronWindowLifecycleState) {
  // When the app window is moved to another virtual desktop on Windows, it may be treated as not visible
  // by the platform even though we still need the stage to keep animating (for window capture usage).
  // Only pause when minimized, and keep running for desktop-switch visibility changes.
  return state.minimized
}

export const useStageWindowLifecycleStore = defineStore('stageWindowLifecycle', () => {
  const windowLifecycle = ref<ElectronWindowLifecycleState>(createDefaultWindowLifecycleState())
  const stagePaused = computed(() => shouldPauseStageFromLifecycle(windowLifecycle.value))
  const isMainStageWindow = resolveInitialRendererRoutePath('/') === '/'

  let initialized = false
  let idleHideTimer: ReturnType<typeof setTimeout> | undefined
  let requestHide: (() => void) | undefined

  function clearIdleHideTimer() {
    if (!idleHideTimer)
      return

    clearTimeout(idleHideTimer)
    idleHideTimer = undefined
  }

  function scheduleIdleHide() {
    if (!isMainStageWindow || !requestHide)
      return

    clearIdleHideTimer()
    idleHideTimer = setTimeout(() => {
      idleHideTimer = undefined
      requestHide?.()
    }, MAIN_STAGE_IDLE_HIDE_MS)
  }

  function updateWindowLifecycle(state: ElectronWindowLifecycleState) {
    windowLifecycle.value = { ...state }

    if (!isMainStageWindow)
      return

    if (state.visible && !state.minimized)
      scheduleIdleHide()
    else
      clearIdleHideTimer()
  }

  async function initializeWindowLifecycleBridge() {
    if (initialized)
      return

    initialized = true

    const context = getElectronEventaContext()

    if (isMainStageWindow) {
      const closeWindow = defineInvoke(context, electronWindowClose)
      requestHide = () => {
        void closeWindow()
      }

      window.addEventListener('pointerdown', scheduleIdleHide, { passive: true })
      window.addEventListener('keydown', scheduleIdleHide)
      window.addEventListener('wheel', scheduleIdleHide, { passive: true })
    }

    context.on(electronWindowLifecycleChanged, (event) => {
      if (!event?.body)
        return
      updateWindowLifecycle(event.body)
    })

    try {
      const getWindowLifecycleState = defineInvoke(context, electronGetWindowLifecycleState)
      updateWindowLifecycle(await getWindowLifecycleState())
    }
    catch (error) {
      console.warn('[StageWindowLifecycle] Failed to fetch initial window lifecycle state.', error)
    }
  }

  return {
    initializeWindowLifecycleBridge,
    stagePaused,
    updateWindowLifecycle,
    windowLifecycle,
  }
})
