import type { Plugin } from 'vue'
import type { RouteRecordRaw } from 'vue-router'

import Tres from '@tresjs/core'

import { autoAnimatePlugin } from '@formkit/auto-animate/vue'
import { PiniaColada } from '@pinia/colada'
import { getElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { trackButtonPlugin } from '@proj-airi/stage-ui/directives/track-button'
import { browserAuthorizationHandler, registerAuthorizationHandler } from '@proj-airi/stage-ui/libs/auth'
import { piniaPluginTracing, setupSynced } from '@proj-airi/stage-ui/libs/pinia'
import { configureAnalyticsAdapter } from '@proj-airi/stage-ui/libs/product-signals'
import { MotionPlugin } from '@vueuse/motion'
import { createPinia } from 'pinia'
import { setupLayouts } from 'virtual:generated-layouts'
import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import { handleHotUpdate, routes } from 'vue-router/auto-routes'

import App from './App.vue'

import {
  electronStageProactiveCheckIn,
  electronStageProactiveHide,
  electronStageProactiveReply,
  electronStageProactiveSetPinned,
} from '../shared/eventa/auto-presence'
import { i18n } from './modules/i18n'
import { resolveInitialRendererRoutePath, resolveRendererWindowContext } from './window-context'

import '@unocss/reset/tailwind.css'
import 'splitpanes/dist/splitpanes.css'
import 'vue-sonner/style.css'
import './styles/main.css'
import 'uno.css'
// Fonts
import '@proj-airi/font-cjkfonts-allseto/index.css'
import '@proj-airi/font-xiaolai/index.css'
import '@fontsource-variable/dm-sans/index.css'
import '@fontsource-variable/jura/index.css'
import '@fontsource-variable/quicksand/index.css'
import '@fontsource-variable/urbanist/index.css'
import '@fontsource-variable/comfortaa/index.css'
import '@fontsource/dm-mono/index.css'
import '@fontsource/dm-serif-display/index.css'
import '@fontsource/gugi/index.css'
import '@fontsource/kiwi-maru/index.css'
import '@fontsource/m-plus-rounded-1c/index.css'
import '@fontsource-variable/nunito/index.css'

configureAnalyticsAdapter(async (options) => {
  const { createPosthogAdapter } = await import('@proj-airi/stage-ui/libs/product-signals/posthog')
  return createPosthogAdapter(options)
})
registerAuthorizationHandler(browserAuthorizationHandler)

function initializeProactiveCheckInBubble() {
  if (resolveInitialRendererRoutePath('/') !== '/')
    return

  const context = getElectronEventaContext()
  const hideAiri = useElectronEventaInvoke(electronStageProactiveHide, context)
  const replyToAiri = useElectronEventaInvoke(electronStageProactiveReply, context)
  const setPinned = useElectronEventaInvoke(electronStageProactiveSetPinned, context)

  let bubble: HTMLDivElement | undefined
  let dismissTimer: ReturnType<typeof setTimeout> | undefined
  let pinned = false

  function clearDismissTimer() {
    if (!dismissTimer)
      return

    clearTimeout(dismissTimer)
    dismissTimer = undefined
  }

  function removeBubble() {
    clearDismissTimer()

    if (!bubble)
      return

    bubble.remove()
    bubble = undefined
  }

  function scheduleBubbleDismiss() {
    clearDismissTimer()
    dismissTimer = setTimeout(removeBubble, 30 * 1000)
  }

  context.on(electronStageProactiveCheckIn, (event) => {
    const text = event?.body?.text?.trim()
    if (!text)
      return

    removeBubble()
    pinned = false

    const panel = document.createElement('div')
    const message = document.createElement('div')
    const replyButton = document.createElement('button')
    const actions = document.createElement('div')
    const hideButton = document.createElement('button')
    const pinButton = document.createElement('button')
    const tail = document.createElement('div')

    message.textContent = text
    replyButton.textContent = 'Trả lời...'
    hideButton.textContent = 'Ẩn'
    pinButton.textContent = 'Giữ'

    Object.assign(panel.style, {
      position: 'fixed',
      top: '92px',
      right: '96px',
      zIndex: '2147483647',
      width: '300px',
      maxWidth: 'calc(100vw - 118px)',
      padding: '12px',
      border: '1px solid rgba(255, 255, 255, 0.82)',
      borderRadius: '18px',
      background: 'rgba(255, 255, 255, 0.97)',
      boxShadow: '0 10px 30px rgba(0, 0, 0, 0.18)',
      color: '#202124',
      fontFamily: 'inherit',
      fontSize: '14px',
      lineHeight: '1.4',
      pointerEvents: 'auto',
      userSelect: 'none',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      opacity: '0',
      transform: 'translateX(14px)',
      transition: 'opacity 160ms ease, transform 160ms ease',
    })

    Object.assign(message.style, {
      whiteSpace: 'pre-wrap',
      overflowWrap: 'anywhere',
    })

    Object.assign(replyButton.style, {
      width: '100%',
      minHeight: '38px',
      padding: '8px 12px',
      border: '1px solid rgba(32, 33, 36, 0.12)',
      borderRadius: '12px',
      background: 'rgba(236, 252, 255, 0.96)',
      color: '#1683a6',
      font: 'inherit',
      textAlign: 'left',
      cursor: 'pointer',
    })

    Object.assign(actions.style, {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: '8px',
    })

    for (const button of [hideButton, pinButton]) {
      Object.assign(button.style, {
        minWidth: '64px',
        height: '32px',
        padding: '0 12px',
        border: '1px solid rgba(32, 33, 36, 0.12)',
        borderRadius: '10px',
        background: '#fff',
        color: '#202124',
        font: 'inherit',
        cursor: 'pointer',
      })
    }

    Object.assign(tail.style, {
      position: 'absolute',
      right: '-7px',
      top: '52px',
      width: '14px',
      height: '14px',
      borderTop: '1px solid rgba(255, 255, 255, 0.82)',
      borderRight: '1px solid rgba(255, 255, 255, 0.82)',
      background: 'rgba(255, 255, 255, 0.97)',
      transform: 'rotate(45deg)',
    })

    replyButton.onclick = async () => {
      clearDismissTimer()
      try {
        await replyToAiri()
        removeBubble()
      }
      catch {
        scheduleBubbleDismiss()
      }
    }

    hideButton.onclick = async () => {
      try {
        await hideAiri()
      }
      finally {
        removeBubble()
      }
    }

    pinButton.onclick = async () => {
      const nextPinned = !pinned
      try {
        pinned = await setPinned({ pinned: nextPinned })
        pinButton.textContent = pinned ? 'Bỏ giữ' : 'Giữ'

        if (pinned)
          clearDismissTimer()
        else
          scheduleBubbleDismiss()
      }
      catch {}
    }

    actions.appendChild(hideButton)
    actions.appendChild(pinButton)
    panel.appendChild(message)
    panel.appendChild(replyButton)
    panel.appendChild(actions)
    panel.appendChild(tail)

    bubble = panel
    document.body.appendChild(panel)

    requestAnimationFrame(() => {
      panel.style.opacity = '1'
      panel.style.transform = 'translateX(0)'
    })

    scheduleBubbleDismiss()
  })
}

const pinia = createPinia()
const synced = setupSynced({
  leadership: resolveRendererWindowContext().leadership,
})
pinia.use(synced.pinia)
if (import.meta.env.DEV)
  pinia.use(piniaPluginTracing)

const router = createRouter({
  history: createWebHashHistory(),
  // TODO: vite-plugin-vue-layouts is long deprecated, replace with another layout solution
  routes: setupLayouts(routes as RouteRecordRaw[]),
})

if (import.meta.hot) {
  handleHotUpdate(router, (updatedRoutes) => {
    router.clearRoutes()
    for (const route of setupLayouts(updatedRoutes))
      router.addRoute(route)
  })
}

createApp(App)
  .use(synced.vue)
  .use(MotionPlugin)
  // TODO: Fix autoAnimatePlugin type error
  .use(autoAnimatePlugin as unknown as Plugin)
  .use(router)
  .use(pinia)
  .use(PiniaColada)
  .use(i18n)
  .use(Tres)
  .use(trackButtonPlugin)
  .mount('#app')

initializeProactiveCheckInBubble()
