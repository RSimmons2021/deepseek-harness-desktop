/** Host registration for browser Chat preferences. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import { CHAT_SETTINGS_NAMESPACE, ChatSettingsSchema } from './chat-settings.ts'

export {
  CHAT_SETTINGS_NAMESPACE, DEFAULT_REASONING_VIEW_MODE, DEFAULT_TRANSCRIPT_VIEW_MODE,
  REASONING_VIEW_FIELD, TRANSCRIPT_VIEW_FIELD,
  REASONING_VIEW_MODES, TRANSCRIPT_VIEW_MODES,
  type ChatSettings, type ReasoningViewMode, type TranscriptViewMode,
} from './chat-settings.ts'

/** Register the durable Chat settings section when a provider exists. */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(
      CHAT_SETTINGS_NAMESPACE,
      ChatSettingsSchema,
    )
  })
}
