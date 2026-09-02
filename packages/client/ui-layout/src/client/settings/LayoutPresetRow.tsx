/** General Settings row for which named arrangement the window starts in. */

import { useState } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { IconChevronDownOutline14, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { LAYOUT_PRESETS, type LayoutPresetId } from '../../layout-settings.ts'
import css from './LayoutPresetRow.module.css'

/** Registration-side layout preference face. */
export interface LayoutPresetRowInjected {
  hooks: {
    /** Persisted arrangement bound as useLayoutPreset. */
    layoutPreset: SnapshotStore<LayoutPresetId>
  }
  /** Rearrange the window and remember the choice. */
  setLayoutPreset: (preset: LayoutPresetId) => void
}

/** Full Settings-row props. */
export type LayoutPresetRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'common'>
  & InjectFace<LayoutPresetRowInjected>

const LABELS: Readonly<Record<LayoutPresetId, 'layout.presetBalanced' | 'layout.presetWorkspace' | 'layout.presetConversation' | 'layout.presetEverything'>> = {
  balanced: 'layout.presetBalanced',
  workspace: 'layout.presetWorkspace',
  conversation: 'layout.presetConversation',
  everything: 'layout.presetEverything',
}

/**
 * Render the window-arrangement selector.
 * @param props - composed Settings slot props.
 * @returns the preference row.
 */
export function LayoutPresetRow({ useLayoutPreset, setLayoutPreset, t }: LayoutPresetRowProps) {
  const preset = useLayoutPreset(value => value)
  const [open, setOpen] = useState(false)
  const selector = (
    <button
      type="button"
      className={css.selector}
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={() => { setOpen(value => !value) }}
    >
      {t(LABELS[preset])}
      <IconChevronDownOutline14 className={css.chevron} />
    </button>
  )

  return (
    <div className={css.row}>
      <div className={css.rowText}>
        <div className={css.title}>{t('layout.presetTitle')}</div>
        <div className={css.desc}>{t('layout.presetDescription')}</div>
      </div>
      <Menu
        open={open}
        onClose={() => { setOpen(false) }}
        items={LAYOUT_PRESETS.map(id => ({ id, label: t(LABELS[id]) }))}
        selectedId={preset}
        onSelect={(id) => {
          setOpen(false)
          setLayoutPreset(id as LayoutPresetId)
        }}
        align="end"
        portal
        anchor={selector}
      />
    </div>
  )
}
