/**
 * Starter prompts for the hero, offered as chips that seed the composer.
 *
 * Adapted from prompt-kit's PromptSuggestion
 * (https://www.prompt-kit.com/docs/prompt-suggestion) into this codebase's
 * idiom: CSS modules and theme tokens rather than Tailwind utilities, and copy
 * resolved from the conversation dictionary rather than literals. Selecting a
 * chip fills the draft instead of sending it, so the prompt stays editable and
 * no message leaves without the person pressing send.
 */
import type { ConversationSlotProps } from '../contract/slots.ts'
import css from './PromptSuggestion.module.css'

/** Dictionary keys of the shipped starter prompts, in display order. */
const SUGGESTIONS = [
  'suggestion.explain',
  'suggestion.findBug',
  'suggestion.tests',
  'suggestion.review',
] as const

/** Chip-row props: the localizer and the draft writer it seeds. */
export interface PromptSuggestionProps {
  /** Conversation-namespace localizer. */
  t: ConversationSlotProps['t']
  /** Write the whole draft; absent while no Session can accept input. */
  setDraft: ((text: string) => void) | undefined
}

/**
 * Render the starter-prompt chips.
 * @param props - localizer and draft writer.
 * @returns the chip row, or nothing while no Session can accept a draft.
 */
export function PromptSuggestion({ t, setDraft }: PromptSuggestionProps) {
  if (setDraft === undefined) return null
  return (
    <div className={css.row} role="group" aria-label={t('suggestion.label')}>
      {SUGGESTIONS.map((key) => {
        const text = t(key)
        return (
          <button key={key} type="button" className={css.chip} onClick={() => { setDraft(text) }}>
            {text}
          </button>
        )
      })}
    </div>
  )
}
