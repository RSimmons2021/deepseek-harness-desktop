/**
 * Desktop frame: the Electron surface renders its own full-window content seat
 * alongside the ordinary sidebar, conversation, and details columns, so the
 * desktop app keeps the Team workspace as its hero and still reaches session
 * history, settings, and tool details. It takes the same layout store as
 * AppFrame, so `ctx.layout` opens and closes the details column here too.
 * Pure component: everything arrives through the framework shares.
 */
import type { ReactNode } from 'react'
import type {
  PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore,
} from '@deepseek-ai/dsh-client-ui-slots'
import { SIDEBAR_COLLAPSED } from './columns.ts'
import type { createLayoutStore } from './stores.ts'
import css from './DesktopFrame.module.css'

/** Root props for the Electron content seat plus the shared shell columns. */
export type DesktopFrameProps =
  & PropsRuntime<'root'>
  & PropsRenderSlots<'desktop.root' | 'sidebar' | 'conversation' | 'details' | 'shell.overlay'>
  & PropsStore<ReturnType<typeof createLayoutStore>>
  & PropsLocale<'common'>

/** Details column grid item; width 0 keeps the subtree mounted (never unmount on close). */
function DetailsColumn(props: { children?: ReactNode }) {
  return <div className={css.detailsCol}>{props.children}</div>
}

/** Lay the window out as sidebar, Team workspace, conversation, and details. */
export function DesktopFrame({ useStore, renderSlot, SessionProvider }: DesktopFrameProps) {
  const panels = useStore(s => s)
  // The store's width preference IS the open/closed state: zero resolves to the
  // compact control rail, which stays mounted so the sidebar occupant keeps its
  // own state across a collapse.
  const sidebarCollapsed = panels.sidebar === 0
  const sidebarWidth = sidebarCollapsed ? SIDEBAR_COLLAPSED : panels.sidebar

  return (
    <div
      className={css.frame}
      style={{
        '--dsh-desktop-sidebar': `${String(sidebarWidth)}px`,
        '--dsh-desktop-details': `${String(panels.details)}px`,
      } as React.CSSProperties}
      data-sidebar-collapsed={sidebarCollapsed || undefined}
      data-details-collapsed={panels.details === 0 || undefined}
    >
      <div className={css.sidebarCol}>
        {renderSlot('sidebar', { collapsed: sidebarCollapsed, width: sidebarWidth })}
      </div>
      <div className={css.workspaceCol}>{renderSlot('desktop.root', {})}</div>
      <div className={css.conversationCol}>{renderSlot('conversation', {})}</div>
      <DetailsColumn>
        <SessionProvider>{renderSlot('details', {})}</SessionProvider>
      </DetailsColumn>
      <div className={css.overlayLayer} data-shell-overlay>
        {renderSlot('shell.overlay', {})}
      </div>
    </div>
  )
}
