<script setup lang="ts">
import { ProfileSwitcherPopover } from '@proj-airi/stage-ui/components'
import { useRouter } from 'vue-router'

import HeaderAvatar from '@proj-airi/stage-layouts/components/Layouts/HeaderAvatar.vue'
import ActionAbout from '@proj-airi/stage-layouts/components/Layouts/InteractiveArea/Actions/About.vue'
import bongLogo from '../../../stage-tamagotchi/src/renderer/public/bong-logo.webp?url'

defineProps<{ mobile?: boolean }>()

const router = useRouter()
function handleManage() {
  router.push('/settings/airi-card')
}
</script>

<template>
  <header mb-1 w-full flex items-center justify-between gap-2 :class="mobile ? 'px-2' : ''" data-testid="bong-web-header">
    <RouterLink to="/" flex items-center gap-2 px-2 text-nowrap outline-none>
      <img :src="bongLogo" alt="Logo BÔNG" h-8 w-8 object-contain>
      <span font-quicksand font-semibold text-xl>BÔNG</span>
    </RouterLink>
    <div flex items-center gap-2>
      <template v-if="!mobile">
        <ActionAbout />
        <ProfileSwitcherPopover @manage="handleManage" />
      </template>
      <HeaderAvatar />
    </div>
  </header>
</template>
