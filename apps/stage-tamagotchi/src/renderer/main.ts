import type { Plugin } from 'vue'
import type { RouteRecordRaw } from 'vue-router'

import Tres from '@tresjs/core'

import { autoAnimatePlugin } from '@formkit/auto-animate/vue'
import { PiniaColada } from '@pinia/colada'
import { electron } from '@proj-airi/electron-eventa'
import { getElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { trackButtonPlugin } from '@proj-airi/stage-ui/directives/track-button'
import { browserAuthorizationHandler, registerAuthorizationHandler } from '@proj-airi/stage-ui/libs/auth'
import { extractMessageText } from '@proj-airi/stage-ui/libs/chat-sync/wire-message'
import { piniaPluginTracing, setupSynced } from '@proj-airi/stage-ui/libs/pinia'
import { configureAnalyticsAdapter } from '@proj-airi/stage-ui/libs/product-signals'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
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
  electronStageProactiveSetPinned,
} from '../shared/eventa/auto-presence'
import { i18n } from './modules/i18n'
import { artistryToolReferences } from './stores/tools'
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

const pinia = createPinia()

function initializeProactiveMiniChat() {
  if (resolveInitialRendererRoutePath('/') !== '/')
    return

  type MiniMessage = { role: 'assistant' | 'user', text: string }

  const context = getElectronEventaContext()
  const hideAiri = useElectronEventaInvoke(electronStageProactiveHide, context)
  const setPinned = useElectronEventaInvoke(electronStageProactiveSetPinned, context)
  const setIgnoreMouseEvents = useElectronEventaInvoke(electron.window.setIgnoreMouseEvents, context)
  const chatStore = useChatStore(pinia)
  const chatSession = useChatSessionStore(pinia)

  let panel: HTMLDivElement | undefined
  let dismissTimer: ReturnType<typeof setTimeout> | undefined
  let chatIdleTimer: ReturnType<typeof setTimeout> | undefined
  let interactionKeepAliveTimer: ReturnType<typeof setInterval> | undefined
  let userPinned = false
  let miniChatOpen = false
  let sending = false
  let messages: MiniMessage[] = []

  function clearDismissTimer() {
    if (!dismissTimer)
      return

    clearTimeout(dismissTimer)
    dismissTimer = undefined
  }

  function clearChatIdleTimer() {
    if (!chatIdleTimer)
      return

    clearTimeout(chatIdleTimer)
    chatIdleTimer = undefined
  }

  function stopInteractionKeepAlive() {
    if (!interactionKeepAliveTimer)
      return

    clearInterval(interactionKeepAliveTimer)
    interactionKeepAliveTimer = undefined
  }

  function keepPanelInteractive() {
    void setIgnoreMouseEvents([false, { forward: true }]).catch(() => {})
  }

  function startInteractionKeepAlive() {
    keepPanelInteractive()
    stopInteractionKeepAlive()
    interactionKeepAliveTimer = setInterval(keepPanelInteractive, 400)
  }

  function destroyPanel() {
    clearDismissTimer()
    clearChatIdleTimer()
    stopInteractionKeepAlive()

    if (!panel)
      return

    panel.remove()
    panel = undefined
  }

  async function syncPinnedState() {
    try {
      await setPinned({ pinned: userPinned || miniChatOpen })
    }
    catch {}
  }

  function schedulePromptDismiss() {
    clearDismissTimer()
    dismissTimer = setTimeout(() => {
      if (!miniChatOpen)
        destroyPanel()
    }, 30 * 1000)
  }

  function scheduleMiniChatIdleHide() {
    clearChatIdleTimer()
    if (!miniChatOpen || userPinned)
      return

    chatIdleTimer = setTimeout(async () => {
      if (!miniChatOpen || userPinned)
        return

      miniChatOpen = false
      await syncPinnedState()

      try {
        await hideAiri()
      }
      finally {
        destroyPanel()
      }
    }, 3 * 60 * 1000)
  }

  function createBasePanel() {
    const nextPanel = document.createElement('div')
    Object.assign(nextPanel.style, {
      position: 'fixed',
      top: '78px',
      right: '138px',
      zIndex: '2147483647',
      width: '286px',
      maxWidth: 'calc(100vw - 152px)',
      maxHeight: '410px',
      padding: '12px',
      border: '1px solid rgba(255, 255, 255, 0.82)',
      borderRadius: '18px',
      background: 'rgba(255, 255, 255, 0.97)',
      boxShadow: '0 12px 32px rgba(0, 0, 0, 0.2)',
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

    const tail = document.createElement('div')
    Object.assign(tail.style, {
      position: 'absolute',
      right: '-7px',
      top: '48px',
      width: '14px',
      height: '14px',
      borderTop: '1px solid rgba(255, 255, 255, 0.82)',
      borderRight: '1px solid rgba(255, 255, 255, 0.82)',
      background: 'rgba(255, 255, 255, 0.97)',
      transform: 'rotate(45deg)',
    })
    nextPanel.appendChild(tail)

    nextPanel.addEventListener('mouseenter', keepPanelInteractive)
    nextPanel.addEventListener('mousemove', keepPanelInteractive)
    return nextPanel
  }

  function styleActionButton(button: HTMLButtonElement) {
    Object.assign(button.style, {
      minWidth: '62px',
      height: '31px',
      padding: '0 11px',
      border: '1px solid rgba(32, 33, 36, 0.12)',
      borderRadius: '10px',
      background: '#fff',
      color: '#202124',
      font: 'inherit',
      cursor: 'pointer',
    })
  }

  function appendActions(target: HTMLDivElement) {
    const actions = document.createElement('div')
    const hideButton = document.createElement('button')
    const pinButton = document.createElement('button')

    hideButton.textContent = 'Ẩn'
    pinButton.textContent = userPinned ? 'Bỏ giữ' : 'Giữ'
    styleActionButton(hideButton)
    styleActionButton(pinButton)

    Object.assign(actions.style, {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: '8px',
    })

    hideButton.onclick = async () => {
      userPinned = false
      miniChatOpen = false
      clearDismissTimer()
      clearChatIdleTimer()
      await syncPinnedState()

      try {
        await hideAiri()
      }
      finally {
        destroyPanel()
      }
    }

    pinButton.onclick = async () => {
      userPinned = !userPinned
      await syncPinnedState()
      pinButton.textContent = userPinned ? 'Bỏ giữ' : 'Giữ'

      if (miniChatOpen) {
        if (userPinned)
          clearChatIdleTimer()
        else
          scheduleMiniChatIdleHide()
      }
    }

    actions.appendChild(hideButton)
    actions.appendChild(pinButton)
    target.appendChild(actions)
  }

  function appendMiniMessage(history: HTMLDivElement, message: MiniMessage) {
    const row = document.createElement('div')
    const bubble = document.createElement('div')

    bubble.textContent = message.text
    Object.assign(row.style, {
      display: 'flex',
      justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
    })
    Object.assign(bubble.style, {
      maxWidth: '86%',
      padding: '8px 10px',
      borderRadius: '12px',
      background: message.role === 'user'
        ? 'rgba(245, 245, 245, 0.98)'
        : 'rgba(232, 250, 255, 0.98)',
      color: message.role === 'user' ? '#202124' : '#157da0',
      whiteSpace: 'pre-wrap',
      overflowWrap: 'anywhere',
    })

    row.appendChild(bubble)
    history.appendChild(row)
    history.scrollTop = history.scrollHeight
  }

  function renderMiniChat() {
    if (!panel)
      return

    const tail = panel.firstElementChild
    panel.replaceChildren()
    if (tail)
      panel.appendChild(tail)

    const history = document.createElement('div')
    const composer = document.createElement('div')
    const input = document.createElement('textarea')
    const sendButton = document.createElement('button')

    Object.assign(history.style, {
      minHeight: '92px',
      maxHeight: '220px',
      display: 'flex',
      flexDirection: 'column',
      gap: '7px',
      overflowY: 'auto',
      padding: '2px',
      userSelect: 'text',
    })

    for (const message of messages)
      appendMiniMessage(history, message)

    Object.assign(composer.style, {
      display: 'grid',
      gridTemplateColumns: '1fr auto',
      gap: '7px',
      alignItems: 'end',
    })

    input.placeholder = 'Nói gì đó...'
    input.rows = 2
    Object.assign(input.style, {
      width: '100%',
      minHeight: '44px',
      maxHeight: '86px',
      resize: 'none',
      padding: '9px 10px',
      border: '1px solid rgba(32, 33, 36, 0.12)',
      borderRadius: '12px',
      background: 'rgba(236, 252, 255, 0.96)',
      color: '#202124',
      font: 'inherit',
      outline: 'none',
      userSelect: 'text',
    })

    sendButton.textContent = 'Gửi'
    Object.assign(sendButton.style, {
      height: '44px',
      padding: '0 12px',
      border: '1px solid rgba(32, 33, 36, 0.12)',
      borderRadius: '12px',
      background: '#fff',
      color: '#157da0',
      font: 'inherit',
      cursor: 'pointer',
    })

    let composing = false

    async function sendMessage() {
      const text = input.value.trim()
      if (!text || sending || composing)
        return

      clearChatIdleTimer()
      sending = true
      input.disabled = true
      sendButton.disabled = true
      messages.push({ role: 'user', text })
      appendMiniMessage(history, { role: 'user', text })
      input.value = ''

      try {
        const result = await chatStore.send({
          sessionId: chatSession.activeSessionId,
          text,
          tools: artistryToolReferences,
        })
        const assistant = result.messages.findLast(message => message.role === 'assistant')
        const reply = assistant ? extractMessageText(assistant).trim() : ''

        if (reply) {
          const assistantMessage: MiniMessage = { role: 'assistant', text: reply }
          messages.push(assistantMessage)
          appendMiniMessage(history, assistantMessage)
        }
      }
      catch {
        input.value = text
      }
      finally {
        sending = false
        input.disabled = false
        sendButton.disabled = false
        input.focus()
        scheduleMiniChatIdleHide()
      }
    }

    input.addEventListener('compositionstart', () => {
      composing = true
    })
    input.addEventListener('compositionend', () => {
      composing = false
    })
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.shiftKey || composing)
        return

      event.preventDefault()
      void sendMessage()
    })
    input.addEventListener('input', scheduleMiniChatIdleHide)
    sendButton.onclick = () => void sendMessage()

    composer.appendChild(input)
    composer.appendChild(sendButton)
    panel.appendChild(history)
    panel.appendChild(composer)
    appendActions(panel)

    requestAnimationFrame(() => input.focus())
  }

  function renderPrompt(text: string) {
    destroyPanel()
    userPinned = false
    miniChatOpen = false
    messages = [{ role: 'assistant', text }]

    panel = createBasePanel()

    const message = document.createElement('div')
    const replyButton = document.createElement('button')

    message.textContent = text
    Object.assign(message.style, {
      whiteSpace: 'pre-wrap',
      overflowWrap: 'anywhere',
      userSelect: 'text',
    })

    replyButton.textContent = 'Trả lời...'
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

    replyButton.onclick = async () => {
      clearDismissTimer()
      miniChatOpen = true
      await syncPinnedState()
      renderMiniChat()
      scheduleMiniChatIdleHide()
    }

    panel.appendChild(message)
    panel.appendChild(replyButton)
    appendActions(panel)
    document.body.appendChild(panel)

    startInteractionKeepAlive()

    requestAnimationFrame(() => {
      if (!panel)
        return

      panel.style.opacity = '1'
      panel.style.transform = 'translateX(0)'
    })

    schedulePromptDismiss()
  }

  context.on(electronStageProactiveCheckIn, (event) => {
    const text = event?.body?.text?.trim()
    if (!text)
      return

    renderPrompt(text)
  })
}

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

initializeProactiveMiniChat()
