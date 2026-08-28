/**
 * Desktop frame: the Electron surface renders its own full-window content seat
 * beside the ordinary conversation column, so the desktop app keeps the Team
 * workspace as its hero and still talks to the agent. Browser chrome — the
 * sidebar and details columns — stays unrendered; those slots remain declared
 * so ordinary Client plugins still activate against them.
 */

import type { PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './DesktopFrame.module.css'

/** Root props for the Electron content seat plus the shared conversation surface. */
export type DesktopFrameProps =
  PropsRuntime<'root'> & PropsRenderSlots<'desktop.root' | 'conversation' | 'shell.overlay'>

/** Split the window between the desktop content seat and the conversation. */
export function DesktopFrame({ renderSlot }: DesktopFrameProps) {
  return (
    <div className={css.frame}>
      <div className={css.workspaceCol}>{renderSlot('desktop.root', {})}</div>
      <div className={css.conversationCol}>{renderSlot('conversation', {})}</div>
      <div className={css.overlayLayer} data-shell-overlay>
        {renderSlot('shell.overlay', {})}
      </div>
    </div>
  )
}
