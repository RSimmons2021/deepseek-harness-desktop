/**
 * Pure concession-chain column solver for the three-column AppFrame.
 * Chain order is fixed by contract: keep center >= CENTER_MIN by shrinking
 * details, then auto-closing it (derived zero width — preferred width
 * preferences are never rewritten, so widening the window restores them).
 * The sidebar never concedes: its rendered width is always the drag
 * preference (or the collapsed rail), and center absorbs any remaining
 * deficit as the last resort. Inputs are the layout store's plain width
 * preferences (0 = closed); a closed sidebar resolves to the fixed
 * SIDEBAR_COLLAPSED control rail while closed details resolve to zero width.
 * The SIDEBAR_AUTO_COLLAPSE breakpoint is consumed by AppFrame, which decides
 * the effective sidebar preference before solving; the solver itself stays
 * breakpoint-free.
 */

/** Resolved widths for one frame; center may drop below CENTER_MIN only at the final fallback. */
export interface Columns { sidebar: number; center: number; details: number }

// Contract-frozen geometry: the three-column concession chain's fixed points.
/** Center column floor; only the final fallback may go below it. */
export const CENTER_MIN = 640
/** Sidebar drag clamp floor. */
export const SIDEBAR_MIN = 264
/** Sidebar drag clamp ceiling. */
export const SIDEBAR_MAX = 420
/** Sidebar width before any user drag. */
export const SIDEBAR_DEFAULT = 280
/** Closed-sidebar rail: a 24px icon column between 16px horizontal paddings. */
export const SIDEBAR_COLLAPSED = 56
/** Viewport width below which the sidebar auto-collapses to the rail (deepsuite
 * LG breakpoint); a manual toggle below it re-expands over the squeezed center
 * (stores.ts narrowExpanded). */
export const SIDEBAR_AUTO_COLLAPSE = 1024
/** Details drag clamp floor. */
export const DETAILS_MIN = 300
/** Details drag clamp ceiling. */
export const DETAILS_MAX = 520
/** Details width before any user drag. */
export const DETAILS_DEFAULT = 360

/*
 * Desktop geometry. The window carries a fourth track — the Team workspace —
 * and the workspace is the flexible one: the sidebar, the conversation, and the
 * details column each hold a width the user set, and the workspace absorbs
 * whatever the window has left. That is what makes the hero grow when the
 * window does without anyone dragging it.
 */

/** Conversation drag clamp floor. */
export const CONVERSATION_MIN = 320
/** Conversation drag clamp ceiling. */
export const CONVERSATION_MAX = 720
/** Conversation width before any user drag. */
export const CONVERSATION_DEFAULT = 460
/** Workspace floor; the desktop concession chain gives it up only as a last resort. */
export const WORKSPACE_MIN = 420

/**
 * Clamp a panel width into its contract range.
 * @param px - requested width.
 * @param min - range lower bound.
 * @param max - range upper bound.
 * @returns the clamped width.
 */
export function clampWidth(px: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(px)))
}

/**
 * Solve the three column widths for one viewport frame. Pure: no hysteresis —
 * the output is a function of (viewport, preferences) only, so recovery on
 * re-widening is automatic. Preferences re-clamp here because they cross the
 * store boundary and callers may still supply stale ranges.
 * @param viewport - available frame width in px.
 * @param sidebar - sidebar width preference in px (0 = closed).
 * @param details - details width preference in px (0 = closed).
 * @returns resolved widths; details 0 means visually closed (never unmounted), while a closed sidebar keeps its compact rail.
 */
export function computeColumns(viewport: number, sidebar: number, details: number): Columns {
  // The sidebar is fixed at its preference (or the rail) — it never concedes.
  const s = sidebar === 0 ? SIDEBAR_COLLAPSED : clampWidth(sidebar, SIDEBAR_MIN, SIDEBAR_MAX)
  const d0 = details === 0 ? 0 : clampWidth(details, DETAILS_MIN, DETAILS_MAX)

  // Step 1: everything fits at preferred widths.
  if (s + d0 + CENTER_MIN <= viewport) return { sidebar: s, center: viewport - s - d0, details: d0 }

  // Step 2: shrink details toward its minimum.
  const d1 = d0 === 0 ? 0 : Math.max(DETAILS_MIN, viewport - s - CENTER_MIN)
  if (s + d1 + CENTER_MIN <= viewport) return { sidebar: s, center: CENTER_MIN, details: d1 }

  // Step 3: auto-close details (derived — preferences untouched); center
  // absorbs any remaining deficit (may drop below CENTER_MIN).
  return { sidebar: s, center: Math.max(0, viewport - s), details: 0 }
}

/** Resolved desktop widths; `workspace` is the remainder and may fall below its floor. */
export interface DesktopColumns { sidebar: number; workspace: number; conversation: number; details: number }

/**
 * Solve the four desktop tracks for one window frame.
 *
 * Pure, and a function of (viewport, preferences) only, so re-widening the
 * window recovers without hysteresis. The concession order is fixed: the
 * details column gives up its width first because it is a companion to
 * whatever is selected, then the conversation shrinks toward its own floor,
 * then details closes outright, and only then does the workspace go under its
 * floor. Preferences are never rewritten, so nothing the user dragged is lost
 * to a window that was briefly too small.
 * @param viewport - available frame width in px.
 * @param sidebar - sidebar width preference in px (0 = the collapsed rail).
 * @param conversation - conversation width preference in px (0 = closed).
 * @param details - details width preference in px (0 = closed).
 * @returns resolved widths; a zero track is visually closed, never unmounted.
 */
export function computeDesktopColumns(
  viewport: number,
  sidebar: number,
  conversation: number,
  details: number,
): DesktopColumns {
  const s = sidebar === 0 ? SIDEBAR_COLLAPSED : clampWidth(sidebar, SIDEBAR_MIN, SIDEBAR_MAX)
  const c0 = conversation === 0 ? 0 : clampWidth(conversation, CONVERSATION_MIN, CONVERSATION_MAX)
  const d0 = details === 0 ? 0 : clampWidth(details, DETAILS_MIN, DETAILS_MAX)
  const room = (c: number, d: number): number => viewport - s - c - d

  // Step 1: every preference fits.
  if (room(c0, d0) >= WORKSPACE_MIN) return { sidebar: s, workspace: room(c0, d0), conversation: c0, details: d0 }

  // Step 2: shrink details toward its own floor.
  const d1 = d0 === 0 ? 0 : Math.max(DETAILS_MIN, viewport - s - c0 - WORKSPACE_MIN)
  if (room(c0, d1) >= WORKSPACE_MIN) return { sidebar: s, workspace: WORKSPACE_MIN, conversation: c0, details: d1 }

  // Step 3: shrink the conversation toward its own floor, details still open.
  const c1 = c0 === 0 ? 0 : Math.max(CONVERSATION_MIN, viewport - s - d1 - WORKSPACE_MIN)
  if (room(c1, d1) >= WORKSPACE_MIN) return { sidebar: s, workspace: WORKSPACE_MIN, conversation: c1, details: d1 }

  // Step 4: close details outright; the conversation keeps its floor.
  if (room(c1, 0) >= WORKSPACE_MIN) return { sidebar: s, workspace: WORKSPACE_MIN, conversation: c1, details: 0 }

  // Step 5: the workspace absorbs the rest, below its floor if it must.
  return { sidebar: s, workspace: Math.max(0, viewport - s - c1), conversation: c1, details: 0 }
}
