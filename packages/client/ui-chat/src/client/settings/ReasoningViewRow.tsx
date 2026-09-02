/** General Settings row for how much of the model's reasoning the transcript shows. */

import { useState } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { IconChevronDownOutline14, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { REASONING_VIEW_MODES, type ReasoningViewMode } from '../../chat-settings.ts'
import type { ChatKey } from '../locale.ts'
import css from './TranscriptViewRow.module.css'

/** Registration-side reasoning preference face. */
export interface ReasoningViewRowInjected {
  hooks: {
    /** Persisted reasoning preference bound as useReasoningView. */
    reasoningView: SnapshotStore<ReasoningViewMode>
  }
  /** Change how much of the model's reasoning the transcript shows. */
  setReasoningView: (mode: ReasoningViewMode) => void
}

/** Full Settings-row props. */
export type ReasoningViewRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'chat'>
  & InjectFace<ReasoningViewRowInjected>

const LABELS: Readonly<Record<ReasoningViewMode, ChatKey>> = {
  collapsed: 'settings.reasoning.collapsed',
  streaming: 'settings.reasoning.streaming',
  expanded: 'settings.reasoning.expanded',
}

/**
 * Render the reasoning presentation selector.
 * @param props - composed Settings slot props.
 * @returns the preference row.
 */
export function ReasoningViewRow({ useReasoningView, setReasoningView, t }: ReasoningViewRowProps) {
  const mode = useReasoningView(value => value)
  const [open, setOpen] = useState(false)
  const closeMenu = () => { setOpen(false) }
  const selector = (
    <button
      type="button"
      className={css.selector}
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={() => { setOpen(value => !value) }}
    >
      {t(LABELS[mode])}
      <IconChevronDownOutline14 className={css.chevron} />
    </button>
  )

  return (
    <div className={css.row}>
      <div className={css.rowText}>
        <div className={css.title}>{t('settings.reasoning.title')}</div>
        <div className={css.desc}>{t('settings.reasoning.description')}</div>
      </div>
      <Menu
        open={open}
        onClose={closeMenu}
        items={REASONING_VIEW_MODES.map(id => ({ id, label: t(LABELS[id]) }))}
        selectedId={mode}
        onSelect={(id) => {
          closeMenu()
          setReasoningView(id as ReasoningViewMode)
        }}
        align="end"
        portal
        anchor={selector}
      />
    </div>
  )
}
