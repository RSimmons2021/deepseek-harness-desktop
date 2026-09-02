// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import type { LayoutSettings } from '@deepseek-ai/dsh-client-ui-layout/src/layout-settings.ts'
import { bindLayoutPreference } from '@deepseek-ai/dsh-client-ui-layout/src/client/layout-preference.ts'

describe('bindLayoutPreference', () => {
  it('rearranges on the gesture that chose the arrangement, then writes it', () => {
    const host = stubSettingsScope<LayoutSettings>()
    const rearrange = vi.fn()
    const preference = bindLayoutPreference(host.scope, rearrange)

    expect(preference.current.getSnapshot()).toBe('balanced')
    expect(rearrange).not.toHaveBeenCalled()

    preference.set('workspace')
    expect(preference.current.getSnapshot()).toBe('workspace')
    expect(rearrange).toHaveBeenCalledWith('workspace')
    expect(host.set).toHaveBeenCalledWith('preset', 'workspace')
  })

  it('adopts what the Host already holds without writing it back', () => {
    const host = stubSettingsScope<LayoutSettings>()
    const rearrange = vi.fn()
    const preference = bindLayoutPreference(host.scope, rearrange)

    // This is what makes an arrangement survive a reload.
    host.publish({ status: 'ready', value: { preset: 'everything' }, revision: 1, writable: true })
    expect(preference.current.getSnapshot()).toBe('everything')
    expect(rearrange).toHaveBeenCalledWith('everything')
    expect(host.set).not.toHaveBeenCalled()

    // An accepted section that changes nothing rearranges nothing.
    host.publish({ value: { preset: 'everything' }, revision: 2 })
    expect(rearrange).toHaveBeenCalledOnce()
  })

  it('adopts an accepted section standing at construction', () => {
    const host = stubSettingsScope<LayoutSettings>()
    host.publish({ status: 'ready', value: { preset: 'conversation' }, revision: 1, writable: true })
    const rearrange = vi.fn()
    expect(bindLayoutPreference(host.scope, rearrange).current.getSnapshot()).toBe('conversation')
    expect(rearrange).toHaveBeenCalledWith('conversation')
  })

  it('stops following the Host once disposed', () => {
    const host = stubSettingsScope<LayoutSettings>()
    const rearrange = vi.fn()
    const preference = bindLayoutPreference(host.scope, rearrange)
    preference.dispose()
    host.publish({ status: 'ready', value: { preset: 'workspace' }, revision: 1, writable: true })
    expect(rearrange).not.toHaveBeenCalled()
  })

  it('re-applies a choice the reader repeats, since the window may have been dragged since', () => {
    const host = stubSettingsScope<LayoutSettings>()
    const rearrange = vi.fn()
    const preference = bindLayoutPreference(host.scope, rearrange)
    preference.set('workspace')
    preference.set('workspace')
    expect(rearrange).toHaveBeenCalledTimes(2)
  })
})
