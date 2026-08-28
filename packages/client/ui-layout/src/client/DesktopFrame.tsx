/** Minimal desktop frame: keep stock slot contracts live, render only the desktop surface. */

import type { PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

/** Root props for the Electron-specific content seat. */
export type DesktopFrameProps = PropsRuntime<'root'> & PropsRenderSlots<'desktop.root'>

/** Give the desktop surface the whole viewport without mounting browser chrome. */
export function DesktopFrame({ renderSlot }: DesktopFrameProps) {
  return renderSlot('desktop.root', {})
}
