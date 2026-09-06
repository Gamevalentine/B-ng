import { defineEventa } from '@moeru/eventa'

export interface ElectronStageProactiveCheckInPayload {
  text: string
}

export const electronStageProactiveCheckIn = defineEventa<ElectronStageProactiveCheckInPayload>('eventa:event:electron:stage:proactive-check-in')
