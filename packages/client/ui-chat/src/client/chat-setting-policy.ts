/** Host-backed policy for one durable Chat presentation field. */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ChatSettings } from '../chat-settings.ts'

/**
 * One Chat presentation preference, live for its readers and durable for the
 * Host. Both of Chat's preferences behave the same way — publish an explicit
 * choice, adopt whatever the Host last accepted, and never write an adopted
 * value back — so they share one policy rather than one class each.
 */
export class ChatSettingPolicy<K extends keyof ChatSettings> {
  /** Reactive current value; the default stands until Host settings arrive. */
  readonly mode: SnapshotStore<ChatSettings[K]>

  /**
   * @param host - durable Chat settings scope.
   * @param field - the section field this policy owns.
   * @param fallback - the value that stands before the Host answers.
   */
  constructor(
    private readonly host: SettingsScope<ChatSettings>,
    private readonly field: K,
    fallback: ChatSettings[K],
  ) {
    this.mode = createSnapshotStore(fallback)
    host.subscribe(() => { this.adopt() })
    this.adopt()
  }

  /**
   * Publish and persist one explicit user choice.
   * @param mode - the new value for this field.
   */
  setMode(mode: ChatSettings[K]): void {
    if (this.mode.getSnapshot() === mode) return
    this.mode.set(mode)
    void this.host.set(this.field, mode)
  }

  /** Adopt the latest accepted Host section without writing it back. */
  private adopt(): void {
    const section = this.host.getSnapshot().value
    if (section === undefined || this.mode.getSnapshot() === section[this.field]) return
    this.mode.set(section[this.field])
  }
}
