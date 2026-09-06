import { defineEventa, defineInvokeEventa } from '@moeru/eventa'

export interface ElectronStageProactiveCheckInPayload {
  text: string
}

export interface ElectronStageProactiveSetPinnedPayload {
  pinned: boolean
}

export const electronStageProactiveCheckIn = defineEventa<ElectronStageProactiveCheckInPayload>('eventa:event:electron:stage:proactive-check-in')
export const electronStageProactiveHide = defineInvokeEventa<void>('eventa:invoke:electron:stage:proactive-hide')
export const electronStageProactiveReply = defineInvokeEventa<void>('eventa:invoke:electron:stage:proactive-reply')
export const electronStageProactiveSetPinned = defineInvokeEventa<boolean, ElectronStageProactiveSetPinnedPayload>('eventa:invoke:electron:stage:proactive-set-pinned')
