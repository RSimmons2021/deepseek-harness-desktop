/** Assistant reasoning disclosure, independent of Tool-call presentation. */
import { useEffect, useRef, useState } from 'react'
import { DisclosureRow, IconThinkOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ReasoningViewMode } from '../../chat-settings.ts'
import type { ChatViewSlotProps } from '../contract/slots.ts'
import a11yCss from './accessibility.module.css'
import css from './ReasoningRow.module.css'

function firstLine(text: string): string {
  const newline = text.indexOf('\n')
  return newline === -1 ? text : text.slice(0, newline)
}

function latestLine(text: string): string {
  const visible = text.trimEnd()
  const newline = visible.lastIndexOf('\n')
  return newline === -1 ? visible : visible.slice(newline + 1)
}

/** One reasoning block's presentation inputs. */
export interface ReasoningRowProps {
  /** Complete or streaming reasoning text. */
  text: string
  /** Whether this block is the streaming tail. */
  running: boolean
  /** How much reasoning the reader asked to see. */
  view: ReasoningViewMode
  /** Conversation locale seat for the running status. */
  t: ChatViewSlotProps['t']
}

/**
 * Render one assistant reasoning block as the Think disclosure row.
 *
 * The preference decides what the row does on its own; a click always wins over
 * it, for this row only, until the block stops running. That is what lets
 * `streaming` open the thinking as it arrives and close it when the answer
 * begins without ever shutting a row the reader deliberately opened.
 * @param props - the text, whether it is still arriving, the preference, and the locale seat.
 * @returns the reasoning disclosure.
 */
export function ReasoningRow({ text, running, view, t }: ReasoningRowProps) {
  const [override, setOverride] = useState<boolean | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const expanded = override ?? (view === 'expanded' || (view === 'streaming' && running))
  // A row the reader opened during the thinking goes back to following the
  // preference once the thinking is over, so an explicit peek does not pin one
  // block open for the life of the transcript.
  useEffect(() => {
    if (!running) setOverride(null)
  }, [running])
  const summary = running ? latestLine(text) : firstLine(text)

  // An open, still-arriving body follows its own tail, so the newest sentence
  // is the one on screen rather than the one the reader has to scroll to.
  useEffect(() => {
    if (!expanded || !running) return
    const element = bodyRef.current
    /* v8 ignore next -- the ref is attached whenever the body is open. */
    if (element === null) return
    element.scrollTop = element.scrollHeight
  }, [expanded, running, text])

  return (
    <div
      className={css.root}
      data-variant="think"
      data-state={running ? 'running' : 'ok'}
      data-expanded={expanded || undefined}
    >
      {running && <span className={a11yCss.visuallyHidden}>{t('row.running')}</span>}
      <DisclosureRow
        rowClassName={css.row}
        leadingClassName={css.leading}
        titleClassName={css.title}
        chevronClassName={css.chevron}
        icon={<IconThinkOutline14 size={14} />}
        title={t('message.think')}
        open={expanded}
        expandable
        expandOnRowClick
        onToggle={() => { setOverride(!expanded) }}
        collapsedContent={(
          <>
            <span className={css.separator} aria-hidden />
            <span className={css.summary} data-follow-end={running || undefined}>
              <span className={css.summaryText}>{summary}</span>
            </span>
          </>
        )}
      >
        <div ref={bodyRef} className={css.thinkBody} data-following={expanded && running || undefined}>{text}</div>
      </DisclosureRow>
    </div>
  )
}
