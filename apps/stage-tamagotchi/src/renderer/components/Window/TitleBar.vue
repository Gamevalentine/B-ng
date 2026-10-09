<script setup lang="ts">
import { useAppRuntime } from '../../composables/runtime'

withDefaults(defineProps<{
  title: string
  icon: string
  variant?: 'default' | 'bong-settings'
}>(), {
  variant: 'default',
})

const emit = defineEmits<{
  titleClick: []
}>()

const { platform } = useAppRuntime()
</script>

<template>
  <div
    class="window-titlebar"
    :class="[
      variant === 'bong-settings' ? 'window-titlebar--bong' : 'window-titlebar--default',
      platform === 'macos' ? 'pl-20' : 'pl-4',
    ]"
    top="0"
    fixed z-100 w-full select-none py-2 pr-4 drag-region
  >
    <div flex drag-region>
      <div
        class="window-titlebar__label [-webkit-app-region:no-drag]"
        transition="all duration-200 ease-in-out"
        flex cursor-pointer select-none items-center gap-2 rounded-md px-1.5 py-0.5
        @click="emit('titleClick')"
      >
        <div
          :class="icon"
          class="window-titlebar__icon"
          select-none whitespace-nowrap
        />
        <div>
          <span select-none whitespace-nowrap text-sm>{{ title }}</span>
        </div>
      </div>
      <div w-full drag-region />
      <div
        flex items-center gap-1
        class="[-webkit-app-region:no-drag]"
      >
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.window-titlebar {
  width: 100dvw;
  transition: background 180ms ease, border-color 180ms ease;
}

.window-titlebar--default {
  background: rgb(245 245 245);
}

:global(.dark) .window-titlebar--default {
  background: rgb(23 23 23);
}

.window-titlebar--bong {
  border-bottom: 1px solid rgb(216 229 247 / 92%);
  background:
    linear-gradient(90deg, rgb(246 251 255 / 98%), rgb(238 247 255 / 98%) 46%, rgb(250 247 255 / 98%));
  color: #263451;
  box-shadow: 0 2px 12px rgb(68 99 150 / 6%);
  backdrop-filter: blur(18px);
}

.window-titlebar__label {
  background: transparent;
}

.window-titlebar__label:hover {
  background: rgb(221 235 255 / 70%);
}

.window-titlebar__icon {
  color: #ff7eb6;
}
</style>
