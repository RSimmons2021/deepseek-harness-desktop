// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import {
  DEFAULT_REASONING_VIEW_MODE, DEFAULT_TRANSCRIPT_VIEW_MODE,
  REASONING_VIEW_FIELD, TRANSCRIPT_VIEW_FIELD, type ChatSettings,
} from '../src/chat-settings.ts'
import { ChatSettingPolicy } from '../src/client/chat-setting-policy.ts'

/** A complete accepted section; the schema requires both fields. */
function section(over: Partial<ChatSettings> = {}): ChatSettings {
  return { transcriptView: 'compact', reasoningView: 'streaming', ...over }
}

describe('ChatSettingPolicy', () => {
  it('publishes an explicit choice before persistence settles', () => {
    const host = stubSettingsScope<ChatSettings>()
    const observed: string[] = []
    let current = (): string => 'unconstructed'
    const scope: typeof host.scope = {
      ...host.scope,
      set: (field, value) => {
        observed.push(`${field}=${String(value)}:${current()}`)
        return host.scope.set(field, value)
      },
    }
    const policy = new ChatSettingPolicy(scope, TRANSCRIPT_VIEW_FIELD, DEFAULT_TRANSCRIPT_VIEW_MODE)
    current = () => policy.mode.getSnapshot()

    expect(policy.mode.getSnapshot()).toBe('compact')
    policy.setMode('normal')
    // The reader sees the new value on the same tick they chose it; the write
    // to the Host is what happens afterwards.
    expect(policy.mode.getSnapshot()).toBe('normal')
    expect(observed).toEqual(['transcriptView=normal:normal'])
    expect(host.set).toHaveBeenCalledWith('transcriptView', 'normal')
  })

  it('adopts Host state and ignores identical writes', () => {
    const host = stubSettingsScope<ChatSettings>()
    const policy = new ChatSettingPolicy(host.scope, TRANSCRIPT_VIEW_FIELD, DEFAULT_TRANSCRIPT_VIEW_MODE)

    host.publish({ status: 'ready', value: section({ transcriptView: 'normal' }), revision: 1, writable: true })
    expect(policy.mode.getSnapshot()).toBe('normal')
    policy.setMode('normal')
    expect(host.set).not.toHaveBeenCalled()

    host.publish({ value: section({ transcriptView: 'compact' }), revision: 2 })
    expect(policy.mode.getSnapshot()).toBe('compact')
  })

  it('adopts an accepted section standing at construction', () => {
    const host = stubSettingsScope<ChatSettings>()
    host.publish({ status: 'ready', value: section({ transcriptView: 'normal' }), revision: 1, writable: true })
    const policy = new ChatSettingPolicy(host.scope, TRANSCRIPT_VIEW_FIELD, DEFAULT_TRANSCRIPT_VIEW_MODE)
    expect(policy.mode.getSnapshot()).toBe('normal')
  })

  it('owns one field each, so a reasoning choice leaves the transcript alone', () => {
    const host = stubSettingsScope<ChatSettings>()
    const transcript = new ChatSettingPolicy(host.scope, TRANSCRIPT_VIEW_FIELD, DEFAULT_TRANSCRIPT_VIEW_MODE)
    const reasoning = new ChatSettingPolicy(host.scope, REASONING_VIEW_FIELD, DEFAULT_REASONING_VIEW_MODE)
    expect(reasoning.mode.getSnapshot()).toBe('streaming')

    reasoning.setMode('expanded')
    expect(host.set).toHaveBeenCalledWith('reasoningView', 'expanded')
    expect(host.set).not.toHaveBeenCalledWith('transcriptView', expect.anything())
    expect(transcript.mode.getSnapshot()).toBe('compact')

    // One accepted section feeds both, and each takes only its own field.
    host.publish({ status: 'ready', value: section({ transcriptView: 'normal', reasoningView: 'collapsed' }), revision: 1, writable: true })
    expect(transcript.mode.getSnapshot()).toBe('normal')
    expect(reasoning.mode.getSnapshot()).toBe('collapsed')
  })
})
