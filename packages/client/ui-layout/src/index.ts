/** Host registration for the browser layout preference. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import { LAYOUT_SETTINGS_NAMESPACE, LayoutSettingsSchema } from './layout-settings.ts'

export {
  DEFAULT_LAYOUT_PRESET, LAYOUT_PRESET_FIELD, LAYOUT_PRESETS, LAYOUT_SETTINGS_NAMESPACE,
  type LayoutPresetId, type LayoutSettings,
} from './layout-settings.ts'

/** Register the durable layout settings section when a provider exists. */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(
      LAYOUT_SETTINGS_NAMESPACE,
      LayoutSettingsSchema,
    )
  })
}
