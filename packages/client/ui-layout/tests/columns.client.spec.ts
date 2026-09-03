import { describe, expect, it } from 'vitest'
import {
  CENTER_MIN, clampWidth, computeColumns, computeDesktopColumns, PRESET_GEOMETRY,
  CONVERSATION_DEFAULT, CONVERSATION_MIN,
  DETAILS_DEFAULT, DETAILS_MIN, SIDEBAR_COLLAPSED, SIDEBAR_DEFAULT, SIDEBAR_MIN,
  WORKSPACE_MIN,
} from '@deepseek-ai/dsh-client-ui-layout/src/client/columns.ts'
import { LAYOUT_PRESETS } from '@deepseek-ai/dsh-client-ui-layout/src/layout-settings.ts'

// Numeric preference form (0 = closed); helpers keep the scenario names readable.
const open = (width: number) => width
const closed = (_width: number) => 0

describe('clampWidth', () => {
  it('clamps into the range and rounds', () => {
    expect(clampWidth(250.4, 240, 420)).toBe(250)
    expect(clampWidth(100, 240, 420)).toBe(240)
    expect(clampWidth(9999, 240, 420)).toBe(420)
  })
})

describe('computeColumns', () => {
  it('step 1: everything fits at preferred widths', () => {
    const cols = computeColumns(1920, open(SIDEBAR_DEFAULT), open(DETAILS_DEFAULT))
    expect(cols).toEqual({ sidebar: 280, center: 1920 - 280 - 360, details: 360 })
  })

  it('closed sidebar keeps its compact rail while closed details contribute zero width', () => {
    expect(computeColumns(1920, closed(300), closed(360)))
      .toEqual({ sidebar: SIDEBAR_COLLAPSED, center: 1920 - SIDEBAR_COLLAPSED, details: 0 })
  })

  it('preferences beyond the clamp range are clamped before solving', () => {
    const cols = computeColumns(1920, open(9999), open(1))
    expect(cols.sidebar).toBe(420)
    expect(cols.details).toBe(300)
    expect(computeColumns(1920, open(1), open(DETAILS_DEFAULT)).sidebar).toBe(SIDEBAR_MIN)
  })

  it('step 2: details shrinks first, center pinned at min', () => {
    // 280 + 360 + 640 = 1280 > 1250; details concedes to 1250-280-640 = 330.
    const cols = computeColumns(1250, open(SIDEBAR_DEFAULT), open(DETAILS_DEFAULT))
    expect(cols).toEqual({ sidebar: 280, center: CENTER_MIN, details: 330 })
  })

  it('boundary: exactly at the step-1/step-2 seam', () => {
    const cols = computeColumns(300 + 360 + CENTER_MIN, open(300), open(360))
    expect(cols).toEqual({ sidebar: 300, center: CENTER_MIN, details: 360 })
    const one = computeColumns(300 + 360 + CENTER_MIN - 1, open(300), open(360))
    expect(one).toEqual({ sidebar: 300, center: CENTER_MIN, details: 359 })
  })

  it('step 3: details auto-closes when its min still starves center — sidebar holds its preference', () => {
    // 280 + 300 + 640 = 1220 > 1210 → details 0; sidebar untouched: center = 1210-280 = 930.
    const cols = computeColumns(1210, open(SIDEBAR_DEFAULT), open(DETAILS_DEFAULT))
    expect(cols).toEqual({ sidebar: 280, center: 930, details: 0 })
  })

  it('the sidebar never concedes: center absorbs the deficit below CENTER_MIN', () => {
    // 700 < 280+640: sidebar keeps 280, center takes 420 < CENTER_MIN.
    const cols = computeColumns(700, open(SIDEBAR_DEFAULT), closed(DETAILS_DEFAULT))
    expect(cols).toEqual({ sidebar: SIDEBAR_DEFAULT, center: 420, details: 0 })
  })

  it('sidebar-closed narrow window: details concedes then auto-closes', () => {
    const fits = computeColumns(SIDEBAR_COLLAPSED + DETAILS_MIN + CENTER_MIN, closed(300), open(DETAILS_DEFAULT))
    expect(fits).toEqual({ sidebar: SIDEBAR_COLLAPSED, center: CENTER_MIN, details: DETAILS_MIN })
    const starved = computeColumns(SIDEBAR_COLLAPSED + DETAILS_MIN + CENTER_MIN - 1, closed(300), open(DETAILS_DEFAULT))
    expect(starved).toEqual({
      sidebar: SIDEBAR_COLLAPSED,
      center: DETAILS_MIN + CENTER_MIN - 1,
      details: 0,
    })
  })

  it('tiny viewport: details closes, sidebar holds, center takes the remainder', () => {
    const cols = computeColumns(400, open(SIDEBAR_DEFAULT), open(DETAILS_DEFAULT))
    expect(cols.details).toBe(0)
    expect(cols.sidebar).toBe(SIDEBAR_DEFAULT)
    expect(cols.center).toBe(Math.max(0, 400 - SIDEBAR_DEFAULT))
  })

  it('recovery is pure: re-widening restores preferred widths untouched', () => {
    const squeezed = computeColumns(1100, open(SIDEBAR_DEFAULT), open(DETAILS_DEFAULT))
    expect(squeezed.details).toBe(0)
    const restored = computeColumns(1920, open(SIDEBAR_DEFAULT), open(DETAILS_DEFAULT))
    expect(restored.details).toBe(DETAILS_DEFAULT)
    expect(restored.sidebar).toBe(SIDEBAR_DEFAULT)
  })
})

describe('computeColumns — degenerate viewports', () => {
  it('sidebar closed and viewport below CENTER_MIN: details auto-closes, center takes the rest', () => {
    // Reaches step 3's auto-close with the compact rail sidebar.
    expect(computeColumns(500, closed(300), open(DETAILS_DEFAULT)))
      .toEqual({ sidebar: SIDEBAR_COLLAPSED, center: 500 - SIDEBAR_COLLAPSED, details: 0 })
  })
})

describe('computeDesktopColumns', () => {
  it('gives the workspace whatever the window has left once every preference fits', () => {
    const cols = computeDesktopColumns(1920, open(SIDEBAR_DEFAULT), open(CONVERSATION_DEFAULT), open(DETAILS_DEFAULT), 'open')
    expect(cols).toEqual({
      sidebar: SIDEBAR_DEFAULT,
      workspace: 1920 - SIDEBAR_DEFAULT - CONVERSATION_DEFAULT - DETAILS_DEFAULT,
      conversation: CONVERSATION_DEFAULT,
      details: DETAILS_DEFAULT,
    })
    // The workspace is the one track that grows with the window, so a wider
    // window is a wider hero and nobody has to drag anything.
    const wider = computeDesktopColumns(2400, open(SIDEBAR_DEFAULT), open(CONVERSATION_DEFAULT), open(DETAILS_DEFAULT), 'open')
    expect(wider.workspace - cols.workspace).toBe(480)
    expect(wider.conversation).toBe(cols.conversation)
  })

  it('a closed sidebar keeps its rail and closed tracks contribute nothing', () => {
    const cols = computeDesktopColumns(1600, closed(SIDEBAR_DEFAULT), closed(CONVERSATION_DEFAULT), closed(DETAILS_DEFAULT), 'open')
    expect(cols).toEqual({ sidebar: SIDEBAR_COLLAPSED, workspace: 1600 - SIDEBAR_COLLAPSED, conversation: 0, details: 0 })
  })

  it('concedes details first, then the conversation, and never rewrites a preference', () => {
    // Wide enough for the sidebar, both floors, and the workspace floor, but
    // not for the preferred details width: details gives up its room first.
    const squeezed = computeDesktopColumns(
      SIDEBAR_DEFAULT + WORKSPACE_MIN + CONVERSATION_DEFAULT + DETAILS_MIN + 40,
      open(SIDEBAR_DEFAULT), open(CONVERSATION_DEFAULT), open(DETAILS_DEFAULT),
      'open',
    )
    expect(squeezed.workspace).toBe(WORKSPACE_MIN)
    expect(squeezed.conversation).toBe(CONVERSATION_DEFAULT)
    expect(squeezed.details).toBe(DETAILS_MIN + 40)

    // Narrower still: details is at its floor, so the conversation gives next.
    const tighter = computeDesktopColumns(
      SIDEBAR_DEFAULT + WORKSPACE_MIN + CONVERSATION_MIN + DETAILS_MIN + 30,
      open(SIDEBAR_DEFAULT), open(CONVERSATION_DEFAULT), open(DETAILS_DEFAULT),
      'open',
    )
    expect(tighter.workspace).toBe(WORKSPACE_MIN)
    expect(tighter.details).toBe(DETAILS_MIN)
    expect(tighter.conversation).toBe(CONVERSATION_MIN + 30)

    // Re-widening restores both, because the solve reads the preferences and
    // never wrote to them.
    const restored = computeDesktopColumns(1920, open(SIDEBAR_DEFAULT), open(CONVERSATION_DEFAULT), open(DETAILS_DEFAULT), 'open')
    expect(restored.conversation).toBe(CONVERSATION_DEFAULT)
    expect(restored.details).toBe(DETAILS_DEFAULT)
  })

  it('closes details outright, then lets the workspace go under its floor', () => {
    const closedDetails = computeDesktopColumns(
      SIDEBAR_DEFAULT + WORKSPACE_MIN + CONVERSATION_MIN,
      open(SIDEBAR_DEFAULT), open(CONVERSATION_DEFAULT), open(DETAILS_DEFAULT),
      'open',
    )
    expect(closedDetails).toEqual({
      sidebar: SIDEBAR_DEFAULT, workspace: WORKSPACE_MIN, conversation: CONVERSATION_MIN, details: 0,
    })

    // Below every floor combined the workspace absorbs the deficit: something
    // has to, and it is the track with the most room to give.
    const last = computeDesktopColumns(900, open(SIDEBAR_DEFAULT), open(CONVERSATION_DEFAULT), open(DETAILS_DEFAULT), 'open')
    expect(last.conversation).toBe(CONVERSATION_MIN)
    expect(last.details).toBe(0)
    expect(last.workspace).toBe(900 - SIDEBAR_DEFAULT - CONVERSATION_MIN)
    expect(last.workspace).toBeLessThan(WORKSPACE_MIN)
  })

  it('never resolves a negative track', () => {
    const cols = computeDesktopColumns(200, open(SIDEBAR_DEFAULT), open(CONVERSATION_DEFAULT), open(DETAILS_DEFAULT), 'open')
    expect(cols.workspace).toBe(0)
  })

  it('a closed workspace makes the conversation the flexible track', () => {
    const cols = computeDesktopColumns(
      1920,
      open(SIDEBAR_DEFAULT), open(CONVERSATION_DEFAULT), open(DETAILS_DEFAULT),
      'closed',
    )
    expect(cols).toEqual({
      sidebar: SIDEBAR_DEFAULT,
      workspace: 0,
      conversation: 1920 - SIDEBAR_DEFAULT - DETAILS_DEFAULT,
      details: DETAILS_DEFAULT,
    })

    // The width preference is not consulted while the conversation holds the
    // window, so re-opening the workspace restores what the user dragged.
    const narrower = computeDesktopColumns(
      1920,
      open(SIDEBAR_DEFAULT), open(CONVERSATION_MIN), open(DETAILS_DEFAULT),
      'closed',
    )
    expect(narrower.conversation).toBe(cols.conversation)
  })
})

describe('PRESET_GEOMETRY', () => {
  it('gives every named arrangement its own widths', () => {
    // The names have to mean different windows, or the choice is decorative.
    const shapes = LAYOUT_PRESETS.map(id => JSON.stringify(PRESET_GEOMETRY[id]))
    expect(new Set(shapes).size).toBe(LAYOUT_PRESETS.length)
  })

  it('hands the window to the column each arrangement is named for', () => {
    const room = (id: (typeof LAYOUT_PRESETS)[number]): number => {
      const g = PRESET_GEOMETRY[id]
      return computeDesktopColumns(1920, g.sidebar, g.conversation, g.details, 'open').workspace
    }
    // Workspace first leaves the most room for the hero and Conversation first
    // the least, which is the whole of what the names promise.
    expect(room('workspace')).toBeGreaterThan(room('balanced'))
    expect(room('balanced')).toBeGreaterThan(room('conversation'))
    expect(PRESET_GEOMETRY.workspace.sidebar).toBe(0)
    expect(PRESET_GEOMETRY.everything.details).toBe(DETAILS_DEFAULT)
    expect(PRESET_GEOMETRY.balanced.details).toBe(0)
  })

  it('writes preferences, so a window too small still concedes normally', () => {
    const g = PRESET_GEOMETRY.everything
    const cols = computeDesktopColumns(900, g.sidebar, g.conversation, g.details, 'open')
    // The arrangement asked for more than the window has; the concession chain
    // answers exactly as it would for the same widths reached by dragging.
    expect(cols.details).toBe(0)
    expect(cols.conversation).toBe(CONVERSATION_MIN)
  })
})
