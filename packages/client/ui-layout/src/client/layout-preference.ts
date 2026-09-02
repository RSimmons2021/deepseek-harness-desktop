/** Host-backed window-arrangement preference. */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import {
  DEFAULT_LAYOUT_PRESET, LAYOUT_PRESET_FIELD,
  type LayoutPresetId, type LayoutSettings,
} from '../layout-settings.ts'

/** The live preference and the write that changes it. */
export interface LayoutPreference {
  /** Reactive current arrangement; the default stands until Host settings arrive. */
  readonly current: SnapshotStore<LayoutPresetId>
  /** Rearrange the window and remember the choice. */
  set: (preset: LayoutPresetId) => void
  /** Stop following the Host document. */
  dispose: () => void
}

/**
 * Follow the Host's window arrangement, and rearrange on every change to it.
 *
 * The arrangement is a preference and is stored; the widths it produces are
 * not, so a drag afterwards stays transient and the next load returns to the
 * arrangement the reader chose rather than a geometry they nudged once. An
 * arrangement adopted from the Host is applied without being written back,
 * which is what lets it survive that load.
 * @param host - durable layout settings scope.
 * @param rearrange - apply one arrangement to the live panels.
 * @returns the live preference, its write, and the unsubscribe.
 */
export function bindLayoutPreference(
  host: SettingsScope<LayoutSettings>,
  rearrange: (preset: LayoutPresetId) => void,
): LayoutPreference {
  const current = createSnapshotStore<LayoutPresetId>(DEFAULT_LAYOUT_PRESET)
  const adopt = (): void => {
    const section = host.getSnapshot().value
    if (section === undefined || current.getSnapshot() === section.preset) return
    current.set(section.preset)
    rearrange(section.preset)
  }
  const unsubscribe = host.subscribe(() => { adopt() })
  adopt()
  return {
    current,
    set: (preset) => {
      if (current.getSnapshot() !== preset) current.set(preset)
      // Applied first, so the window rearranges on the same gesture that chose
      // it; the write to the Host is what happens afterwards.
      rearrange(preset)
      void host.set(LAYOUT_PRESET_FIELD, preset)
    },
    dispose: unsubscribe,
  }
}
