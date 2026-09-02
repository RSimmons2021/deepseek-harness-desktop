/** Layout preference stored in the Host user-settings document. */

import z from '@deepseek-ai/schemastery'

/** Settings namespace owned by the layout target. */
export const LAYOUT_SETTINGS_NAMESPACE = 'ui-layout'

/** Field carrying which named arrangement the window starts in. */
export const LAYOUT_PRESET_FIELD = 'preset'

/**
 * Named window arrangements.
 *
 * Each one is a starting point rather than a mode: the columns stay draggable
 * afterwards, and the preset is what the window returns to on the next load.
 * `balanced` gives every column room. `workspace` collapses the session rail
 * and narrows the conversation so the Team takes the window. `conversation`
 * does the reverse. `everything` opens the details column alongside the rest.
 */
export const LAYOUT_PRESETS = ['balanced', 'workspace', 'conversation', 'everything'] as const

/** Window arrangement accepted at settings boundaries. */
export type LayoutPresetId = typeof LAYOUT_PRESETS[number]

/** Default keeps the arrangement the frames shipped with. */
export const DEFAULT_LAYOUT_PRESET: LayoutPresetId = 'balanced'

/** Durable layout section shared by the Host schema and browser scope. */
export interface LayoutSettings {
  /** Which named arrangement the window starts in. */
  preset: LayoutPresetId
}

/** Durable layout schema; also the wire envelope the browser scope validates against. */
export const LayoutSettingsSchema: z<LayoutSettings> = z.object({
  [LAYOUT_PRESET_FIELD]: z.union([...LAYOUT_PRESETS]).default(DEFAULT_LAYOUT_PRESET),
})
