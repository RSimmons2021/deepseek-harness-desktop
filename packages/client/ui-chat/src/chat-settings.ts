/** Chat transcript preferences stored in the Host user-settings document. */

import z from '@deepseek-ai/schemastery'

/** Settings namespace owned by the Chat target. */
export const CHAT_SETTINGS_NAMESPACE = 'ui-chat'

/** Field carrying the completed-Turn transcript presentation mode. */
export const TRANSCRIPT_VIEW_FIELD = 'transcriptView'

/** Transcript presentation modes accepted at settings boundaries. */
export const TRANSCRIPT_VIEW_MODES = ['normal', 'compact'] as const

/** Completed-Turn transcript presentation. */
export type TranscriptViewMode = typeof TRANSCRIPT_VIEW_MODES[number]

/** Default preserves the compact process disclosure introduced by Chat. */
export const DEFAULT_TRANSCRIPT_VIEW_MODE: TranscriptViewMode = 'compact'

/** Field carrying how much of the model's reasoning the transcript shows. */
export const REASONING_VIEW_FIELD = 'reasoningView'

/**
 * How much of the model's reasoning the transcript shows.
 *
 * `collapsed` keeps the Think row shut until it is opened. `streaming` opens it
 * for as long as the model is still thinking and shuts it once the answer
 * begins, so the reasoning is readable while it happens without leaving a wall
 * of it behind. `expanded` keeps every reasoning block open.
 */
export const REASONING_VIEW_MODES = ['collapsed', 'streaming', 'expanded'] as const

/** Reasoning presentation accepted at settings boundaries. */
export type ReasoningViewMode = typeof REASONING_VIEW_MODES[number]

/** Default shows the thinking as it happens; a settled transcript stays scannable. */
export const DEFAULT_REASONING_VIEW_MODE: ReasoningViewMode = 'streaming'

/** Durable Chat section shared by the Host schema and browser scope. */
export interface ChatSettings {
  /** Presentation mode for completed Turn process content. */
  transcriptView: TranscriptViewMode
  /** How much of the model's reasoning the transcript shows. */
  reasoningView: ReasoningViewMode
}

/** Durable Chat schema; also the wire envelope the browser scope validates against. */
export const ChatSettingsSchema: z<ChatSettings> = z.object({
  [TRANSCRIPT_VIEW_FIELD]: z.union([...TRANSCRIPT_VIEW_MODES]).default(DEFAULT_TRANSCRIPT_VIEW_MODE),
  [REASONING_VIEW_FIELD]: z.union([...REASONING_VIEW_MODES]).default(DEFAULT_REASONING_VIEW_MODE),
})
