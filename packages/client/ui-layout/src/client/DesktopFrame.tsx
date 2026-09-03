/**
 * Desktop frame: the Electron surface renders its own full-window content seat
 * alongside the ordinary sidebar, conversation, and details columns, so the
 * desktop app keeps the Team workspace as its hero and still reaches session
 * history, settings, and tool details. It takes the same layout store as
 * AppFrame, so `ctx.layout` opens and closes the details column here too, and
 * it owns the same drag handles: every seam between two columns is one the
 * reader can move. Pure component: everything arrives through the framework
 * shares.
 */
import { useRef } from 'react'
import type { ReactNode } from 'react'
import type {
  PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore,
} from '@deepseek-ai/dsh-client-ui-slots'
import { computeDesktopColumns } from './columns.ts'
import { DragHandle } from './DragHandle.tsx'
import { useFrameWidth, useSeamGestures } from './frame-geometry.ts'
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
export function DesktopFrame({ useStore, useSessions, actions, renderSlot, SessionProvider, t }: DesktopFrameProps) {
  const panels = useStore(s => s)
  /*
   * A blank Session is one nothing has happened in yet, which is exactly when
   * the Team surface can only show an inert roster: no workspace picked, or one
   * picked and no work sent. The conversation carries both the workspace picker
   * and the composer, so it takes the room until the Session stops being blank.
   * Workspace membership itself would be the narrower signal, but it is
   * declared by the conversation package, which already depends on this one.
   */
  const sessionBlank = useSessions((sessions) => {
    const current = sessions.current
    return current === undefined || sessions.byId[current]?.blank !== false
  })
  const frameRef = useRef<HTMLDivElement | null>(null)
  const viewport = useFrameWidth(frameRef)

  // The store's width preference IS the open/closed state: zero resolves to the
  // compact control rail, which stays mounted so the sidebar occupant keeps its
  // own state across a collapse.
  const sidebarCollapsed = panels.sidebar === 0
  // A blank Session hands the whole window to the conversation, so the
  // workspace track is the one that closes and the seams around it go with it.
  const cols = computeDesktopColumns(
    viewport,
    sidebarCollapsed ? 0 : panels.sidebar,
    panels.conversation,
    panels.details,
    sessionBlank ? 'closed' : 'open',
  )
  const colsRef = useRef(cols)
  colsRef.current = cols

  // Track transitions pause for the whole gesture: an eased track would detach
  // the column edge from the pointer.
  const { dragging, bind } = useSeamGestures()
  const sidebarSeam = bind(() => colsRef.current.sidebar, actions.setSidebar, 'right')
  // The workspace and conversation share one seam: dragging it right gives the
  // workspace the room and takes it from the conversation.
  const workspaceSeam = bind(() => colsRef.current.conversation, actions.setConversation, 'left')
  const detailsSeam = bind(() => colsRef.current.details, actions.setDetails, 'left')

  const workspaceEdge = cols.sidebar + cols.workspace

  return (
    <div
      ref={frameRef}
      className={css.frame}
      style={{
        gridTemplateColumns:
          `${String(cols.sidebar)}px ${String(cols.workspace)}px ${String(cols.conversation)}px ${String(cols.details)}px`,
      }}
      data-sidebar-collapsed={sidebarCollapsed || undefined}
      data-details-collapsed={cols.details === 0 || undefined}
      data-session-blank={sessionBlank || undefined}
      data-dragging={dragging || undefined}
    >
      <div className={css.sidebarCol}>
        {renderSlot('sidebar', { collapsed: sidebarCollapsed, width: cols.sidebar })}
      </div>
      <div className={css.workspaceCol}>{renderSlot('desktop.root', {})}</div>
      <div className={css.conversationCol}>{renderSlot('conversation', {})}</div>
      <DetailsColumn>
        <SessionProvider>{renderSlot('details', {})}</SessionProvider>
      </DetailsColumn>
      <div className={css.overlayLayer} data-shell-overlay>
        {renderSlot('shell.overlay', {})}
      </div>
      {/* The collapsed rail is fixed-width: no seam to move while closed. */}
      {!sidebarCollapsed && (
        <DragHandle
          side="sidebar"
          left={cols.sidebar}
          label={t('layout.resizeSidebar')}
          {...sidebarSeam}
        />
      )}
      {cols.workspace > 0 && cols.conversation > 0 && (
        <DragHandle
          side="workspace"
          left={workspaceEdge}
          label={t('layout.resizeWorkspace')}
          {...workspaceSeam}
        />
      )}
      {cols.details > 0 && (
        <DragHandle
          side="details"
          left={viewport - cols.details}
          label={t('layout.resizeDetails')}
          {...detailsSeam}
        />
      )}
    </div>
  )
}
