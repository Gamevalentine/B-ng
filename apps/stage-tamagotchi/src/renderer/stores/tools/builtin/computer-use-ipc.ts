/** Vue/Pinia arrays are proxies and cannot cross Electron IPC via structured clone. */
export function toIpcSafeComputerUseArgv(argv: readonly string[]): string[] {
  return Array.from(argv)
}
