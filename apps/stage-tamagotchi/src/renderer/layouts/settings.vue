<script setup lang="ts">
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView, useRoute, useRouter } from 'vue-router'

interface SettingsNavItem {
  label: string
  to: string
  icon: string
  match: (path: string) => boolean
}

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const providersStore = useProviderStore()
const scrollContainer = ref<HTMLElement>()
const searchQuery = ref('')
const logoFailed = ref(false)

const routeMeta = computed(() => route.meta as {
  titleKey?: string
  subtitleKey?: string
  title?: string
  subtitle?: string
})

const providerTitle = computed(() => {
  if (!route.path.startsWith('/settings/providers/'))
    return undefined

  const segments = route.path.split('/').filter(Boolean)
  const providerId = segments[3]

  if (!providerId)
    return undefined

  return providersStore.findProviderDefinition(providerId)?.nameLocalize({ t })
})

const routeHeaderMetadata = computed(() => {
  const { titleKey, subtitleKey, title, subtitle } = routeMeta.value
  const resolvedTitle = titleKey ? t(titleKey) : title
  const resolvedSubtitle = subtitleKey ? t(subtitleKey) : subtitle

  if (resolvedTitle || resolvedSubtitle) {
    return {
      title: resolvedTitle,
      subtitle: resolvedSubtitle,
    }
  }

  if (providerTitle.value) {
    return {
      title: providerTitle.value,
      subtitle: 'Cài đặt BÔNG',
    }
  }

  return undefined
})

const navItems: SettingsNavItem[] = [
  {
    label: 'Tổng quan',
    to: '/settings',
    icon: 'i-solar:home-smile-angle-line-duotone',
    match: path => path === '/settings',
  },
  {
    label: 'BÔNG Card',
    to: '/settings/airi-card',
    icon: 'i-solar:user-id-line-duotone',
    match: path => path.startsWith('/settings/airi-card'),
  },
  {
    label: 'Mô-đun',
    to: '/settings/modules',
    icon: 'i-solar:box-minimalistic-line-duotone',
    match: path => path === '/settings/modules',
  },
  {
    label: 'Giao diện',
    to: '/settings/scene',
    icon: 'i-solar:palette-line-duotone',
    match: path => path.startsWith('/settings/scene'),
  },
  {
    label: 'Mô hình AI',
    to: '/settings/modules/consciousness',
    icon: 'i-solar:brain-line-duotone',
    match: path => path.startsWith('/settings/modules/consciousness') || path.startsWith('/settings/providers'),
  },
  {
    label: 'Bộ nhớ',
    to: '/settings/memory',
    icon: 'i-solar:database-line-duotone',
    match: path => path.startsWith('/settings/memory'),
  },
  {
    label: 'Giọng nói',
    to: '/settings/modules/speech',
    icon: 'i-solar:microphone-3-line-duotone',
    match: path => path.startsWith('/settings/modules/speech') || path.startsWith('/settings/modules/hearing'),
  },
  {
    label: 'Nâng cao',
    to: '/settings/system',
    icon: 'i-solar:settings-minimalistic-line-duotone',
    match: path => path.startsWith('/settings/system') || path.startsWith('/settings/data') || path.startsWith('/settings/connection'),
  },
]

const filteredNavItems = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase('vi')
  if (!query)
    return navItems
  return navItems.filter(item => item.label.toLocaleLowerCase('vi').includes(query))
})

const isBongCardPage = computed(() => route.path === '/settings/airi-card')
const isBongMemoryPage = computed(() => route.path === '/settings/memory')
const isOverviewPage = computed(() => route.path === '/settings')
const routeIcon = computed(() => typeof route.meta.icon === 'string' ? route.meta.icon : 'i-solar:settings-line-duotone')

watch(() => route.fullPath, async () => {
  await nextTick()
  scrollContainer.value?.scrollTo({ top: 0, behavior: 'auto' })
}, { immediate: true })

function navigate(to: string) {
  void router.push(to)
}

function handleSearchEnter() {
  const [first] = filteredNavItems.value
  if (first)
    navigate(first.to)
}
</script>

<template>
  <div class="bong-settings-shell">
    <div class="bong-settings-window">
      <aside class="bong-settings-sidebar">
        <div class="bong-brand">
          <div class="bong-brand__fallback">
            <div class="bong-brand__mascot bong-brand__mascot--image">
              <img
                v-if="!logoFailed"
                src="/bong-mascot.webp"
                alt=""
                @error="logoFailed = true"
              >
              <span v-else i-solar:heart-shine-bold-duotone />
            </div>
            <div>
              <div class="bong-brand__word">
                BÔNG
              </div>
              <div class="bong-brand__tagline">
                Trợ lý AI của riêng anh ♡
              </div>
            </div>
          </div>
        </div>

        <nav class="bong-settings-nav" aria-label="Điều hướng cài đặt BÔNG">
          <button
            v-for="item in navItems"
            :key="item.to"
            type="button"
            class="bong-settings-nav__item"
            :class="{ active: item.match(route.path) }"
            @click="navigate(item.to)"
          >
            <span class="bong-settings-nav__icon" :class="item.icon" />
            <span>{{ item.label }}</span>
          </button>
        </nav>

        <div class="bong-sidebar-note">
          <span class="bong-sidebar-note__heart">♥</span>
          <span>Luôn ở đây<br>cùng anh ♡</span>
          <div class="bong-sidebar-note__stroke" />
        </div>
      </aside>

      <main class="bong-settings-main">
        <div class="bong-settings-top">
          <div>
            <h1>Cài đặt BÔNG</h1>
            <p>Tùy chỉnh trợ lý cá nhân của anh.</p>
          </div>

          <div class="bong-settings-search">
            <span i-solar:magnifer-line-duotone />
            <input
              v-model="searchQuery"
              type="search"
              placeholder="Tìm trong cài đặt..."
              aria-label="Tìm trong cài đặt"
              @keydown.enter="handleSearchEnter"
            >
            <div v-if="searchQuery && filteredNavItems.length" class="bong-settings-search__results">
              <button
                v-for="item in filteredNavItems"
                :key="item.to"
                type="button"
                @click="navigate(item.to); searchQuery = ''"
              >
                <span :class="item.icon" />
                {{ item.label }}
              </button>
            </div>
          </div>
        </div>

        <div ref="scrollContainer" class="bong-settings-scroll">
          <div v-if="!isBongCardPage && !isOverviewPage && !isBongMemoryPage && routeHeaderMetadata" class="bong-route-heading">
            <div class="bong-route-heading__icon">
              <span :class="routeIcon" />
            </div>
            <div>
              <h2>{{ routeHeaderMetadata.title }}</h2>
              <p>{{ routeHeaderMetadata.subtitle || 'Tùy chỉnh mục cài đặt này của BÔNG.' }}</p>
            </div>
          </div>

          <RouterView />
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.bong-settings-shell {
  --bong-sidebar: 310px;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background:
    radial-gradient(circle at 88% 8%, rgb(230 240 255 / 78%), transparent 28%),
    linear-gradient(135deg, #f9fbff 0%, #f5f9ff 48%, #fffafd 100%);
  color: #1d2943;
}

.bong-settings-window {
  display: grid;
  height: 100%;
  min-height: 0;
  grid-template-columns: var(--bong-sidebar) minmax(0, 1fr);
  padding-top: 0;
}

.bong-settings-sidebar {
  position: relative;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid rgb(217 229 247 / 85%);
  background:
    radial-gradient(circle at 20% 92%, rgb(224 239 255 / 96%), transparent 25%),
    linear-gradient(180deg, rgb(255 255 255 / 94%), rgb(247 251 255 / 92%));
  box-shadow: 8px 0 28px rgb(77 110 163 / 7%);
  backdrop-filter: blur(22px);
}

.bong-brand {
  min-height: 170px;
  display: grid;
  place-items: center;
  padding: 22px 22px 8px;
}

.bong-brand__fallback {
  display: flex;
  align-items: center;
  gap: 14px;
}

.bong-brand__mascot {
  display: grid;
  width: 92px;
  height: 92px;
  flex: 0 0 auto;
  overflow: hidden;
  place-items: center;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: #ff6eaf;
  font-size: 38px;
  box-shadow: none;
}

.bong-brand__mascot--image img {
  width: 92px;
  height: 92px;
  max-width: none;
  object-fit: contain;
}

.bong-brand__word {
  background: linear-gradient(90deg, #ff82b9, #ae87ff 48%, #62a5ff);
  background-clip: text;
  color: transparent;
  font-size: 34px;
  font-weight: 850;
  letter-spacing: 0.03em;
}

.bong-brand__tagline {
  margin-top: 2px;
  color: #8c96ae;
  font-size: 11px;
}

.bong-settings-nav {
  min-height: 0;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 7px;
  overflow-y: auto;
  padding: 12px 18px;
  scrollbar-width: none;
}

.bong-settings-nav::-webkit-scrollbar {
  display: none;
}

.bong-settings-nav__item {
  display: flex;
  width: 100%;
  height: 54px;
  align-items: center;
  gap: 15px;
  border: 1px solid transparent;
  border-radius: 16px;
  padding: 0 16px;
  background: transparent;
  color: #445474;
  cursor: pointer;
  font-size: 16px;
  text-align: left;
  transition: 170ms ease;
}

.bong-settings-nav__item:hover {
  border-color: #e4edfb;
  background: #f6f9ff;
  color: #225abd;
}

.bong-settings-nav__item.active {
  border-color: #d2e5ff;
  background: linear-gradient(135deg, #eaf4ff, #d9ebff);
  color: #1760d6;
  box-shadow: inset 0 1px 0 #fff, 0 8px 20px rgb(59 112 206 / 10%);
}

.bong-settings-nav__icon {
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  font-size: 24px;
}

.bong-sidebar-note {
  position: relative;
  width: 220px;
  flex: 0 0 auto;
  margin: 8px 28px 20px;
  color: #4f79d8;
  font-family: 'Xiaolai', 'M PLUS Rounded 1c', sans-serif;
  font-size: 19px;
  font-style: italic;
  line-height: 1.4;
  transform: rotate(-4deg);
}

.bong-sidebar-note__heart {
  position: absolute;
  top: -18px;
  left: 14px;
  color: #ff82b4;
  font-size: 18px;
}

.bong-sidebar-note__stroke {
  width: 160px;
  height: 34px;
  margin-top: 3px;
  border-bottom: 2px solid #5c85e8;
  border-radius: 50%;
  transform: rotate(-4deg);
}

.bong-settings-main {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0 28px 0 30px;
}

.bong-settings-top {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 31px 8px 24px;
}

.bong-settings-top h1 {
  margin: 0;
  color: #142342;
  font-size: clamp(30px, 3vw, 42px);
  font-weight: 850;
  letter-spacing: -0.04em;
}

.bong-settings-top p {
  margin: 5px 0 0;
  color: #7e8aa6;
  font-size: 16px;
}

.bong-settings-search {
  position: relative;
  display: flex;
  width: min(360px, 42%);
  height: 50px;
  align-items: center;
  gap: 10px;
  border: 1px solid #cfddf3;
  border-radius: 17px;
  padding: 0 16px;
  background: rgb(255 255 255 / 82%);
  color: #6480b0;
  box-shadow: inset 0 1px 0 #fff;
}

.bong-settings-search > span {
  flex: 0 0 auto;
  font-size: 24px;
}

.bong-settings-search input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: #33415e;
  font: inherit;
}

.bong-settings-search input::placeholder {
  color: #9aa6bd;
}

.bong-settings-search__results {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 20;
  width: 100%;
  overflow: hidden;
  border: 1px solid #dbe6f7;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 16px 36px rgb(46 72 116 / 16%);
}

.bong-settings-search__results button {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 9px;
  border: 0;
  padding: 10px 13px;
  background: transparent;
  color: #445474;
  cursor: pointer;
  text-align: left;
}

.bong-settings-search__results button:hover {
  background: #f2f7ff;
  color: #245fc9;
}

.bong-settings-scroll {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 0 8px 28px;
  scrollbar-width: thin;
  scrollbar-color: #cddcf3 transparent;
}

.bong-route-heading {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 16px;
  border: 1px solid #e0e9f6;
  border-radius: 20px;
  padding: 16px 18px;
  background: rgb(255 255 255 / 72%);
}

.bong-route-heading__icon {
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  border-radius: 15px;
  background: #edf5ff;
  color: #3677eb;
  font-size: 24px;
}

.bong-route-heading h2 {
  margin: 0;
  color: #21314e;
  font-size: 19px;
  font-weight: 780;
}

.bong-route-heading p {
  margin: 3px 0 0;
  color: #8792a9;
  font-size: 13px;
}

@media (max-width: 900px) {
  .bong-settings-shell {
    --bong-sidebar: 220px;
  }

  .bong-brand__image {
    width: 190px;
  }

  .bong-settings-nav {
    padding-inline: 12px;
  }

  .bong-settings-nav__item {
    height: 50px;
    padding-inline: 13px;
    font-size: 14px;
  }

  .bong-sidebar-note {
    display: none;
  }

  .bong-settings-main {
    padding-inline: 18px;
  }
}

@media (max-width: 700px) {
  .bong-settings-window {
    grid-template-columns: 72px minmax(0, 1fr);
  }

  .bong-brand {
    min-height: 84px;
    padding: 12px 8px;
  }

  .bong-brand__image,
  .bong-brand__word,
  .bong-brand__tagline {
    display: none;
  }

  .bong-brand__fallback {
    gap: 0;
  }

  .bong-brand__mascot {
    width: 46px;
    height: 46px;
    font-size: 24px;
  }

  .bong-settings-nav {
    align-items: center;
    padding: 8px;
  }

  .bong-settings-nav__item {
    width: 52px;
    padding: 0;
    justify-content: center;
  }

  .bong-settings-nav__item > span:last-child {
    display: none;
  }

  .bong-settings-top {
    align-items: flex-start;
    flex-direction: column;
  }

  .bong-settings-search {
    width: 100%;
  }
}

/* BÔNG approved pastel Settings layout — reversible visual overrides. */
.bong-settings-shell { --bong-sidebar: 306px; background: radial-gradient(circle at 90% 12%, #f0f4ff 0,transparent 36%),linear-gradient(145deg,#f9fcff 0%,#f7faff 54%,#fff9fd 100%); }
.bong-settings-sidebar { isolation: isolate; background: linear-gradient(180deg,#fff 0%,#fcfdff 64%,#eaf3ff 100%); }
.bong-settings-sidebar::before { content: ""; position: absolute; pointer-events: none; left: -24px; right: -24px; bottom: -16px; height: 176px; z-index: -1; background: radial-gradient(ellipse 96px 43px at 15% 72%,#fff 92%,transparent 94%), radial-gradient(ellipse 76px 46px at 36% 85%,#fff 94%,transparent 96%), radial-gradient(ellipse 112px 64px at 65% 81%,#fff 92%,transparent 94%), radial-gradient(ellipse 100px 48px at 96% 68%,#fff 93%,transparent 95%), linear-gradient(180deg,transparent 0%,#e4f0ff 100%); opacity:.92; }
.bong-brand { min-height: 158px; padding: 22px 14px 14px; }
.bong-brand__fallback { gap:10px; }
.bong-brand__mascot, .bong-brand__mascot--image img { width: 96px; height: 96px; }
.bong-brand__word { position:relative; font-size:36px; line-height:1.1; letter-spacing:.015em; }
.bong-brand__word::after { content:"♥"; position:absolute; right:-15px; top:-11px; font-size:13px; color:#fa83ba; background:none; }
.bong-brand__tagline { font-size:11px; white-space:nowrap; }
.bong-settings-nav { z-index:1; gap:5px; padding:11px 18px 20px; }
.bong-settings-nav__item { height:52px; min-height:52px; border-radius:18px; gap:14px; font-size:16px; }
.bong-settings-nav__item.active { background:linear-gradient(110deg,#dfebff,#d6eafa); box-shadow:inset 0 1px 0 #fff,0 10px 24px #7da8e51e; }
.bong-sidebar-note { z-index:1; margin:8px 28px 18px; }
.bong-settings-main { padding:0 26px; }
.bong-settings-top { padding:28px 7px 22px; }
.bong-settings-top h1 { font-size:clamp(29px,3vw,40px); }
.bong-settings-search { height:48px; border-radius:16px; }
.bong-settings-scroll { padding-bottom:22px; }
@media (max-height:960px) and (min-width:900px) { .bong-brand { min-height:138px; } .bong-settings-top { padding-top:24px; padding-bottom:18px; } .bong-settings-nav__item { height:47px; min-height:47px; } .bong-sidebar-note { font-size:16px; } }
@media (max-width:900px) { .bong-settings-shell { --bong-sidebar:220px; } .bong-brand__word { font-size:25px; } .bong-brand__mascot, .bong-brand__mascot--image img { width:68px; height:68px; } }
@media (max-width:700px) { .bong-settings-window { grid-template-columns:72px minmax(0,1fr); } .bong-brand__mascot, .bong-brand__mascot--image img { width:46px; height:46px; } .bong-settings-top { gap:14px; } .bong-settings-main { padding-inline:12px; } }
</style>
