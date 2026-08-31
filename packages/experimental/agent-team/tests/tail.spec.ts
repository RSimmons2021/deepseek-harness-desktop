/** What a member's own Session events become when a tail reads them. */

import { describe, expect, it } from 'vitest'
import type { SessionEvent, SessionEventMap, SessionEventType } from '@deepseek-ai/dsh-session'
import { tailLineOf } from '../src/tail.ts'

function event<T extends SessionEventType>(type: T, data: SessionEventMap[T], seq: number): SessionEvent<T> {
  return { type, data, seq, time: seq } as SessionEvent<T>
}

function assistant(content: unknown[], seq = 1): SessionEvent {
  return event('assistant/message', {
    turn: 1,
    step: 1,
    message: { id: 'm', role: 'assistant', content, source: { kind: 'model' } },
  } as never, seq)
}

describe('Agent Teams tail projection', () => {
  it('shows a member\'s prose and ignores the blocks a tail cannot read', () => {
    expect(tailLineOf(assistant([
      { type: 'reasoning', text: 'thinking out loud' },
      { type: 'text', text: '  Rewrote the adapter.  ' },
      { type: 'image', source: { kind: 'base64', data: '', mediaType: 'image/png' } },
    ]), 400)).toEqual({ seq: 1, time: 1, kind: 'assistant', text: 'Rewrote the adapter.' })

    // A step that only called tools has no prose of its own.
    expect(tailLineOf(assistant([{ type: 'tool-call', toolCallId: 'c', name: 'write', input: {} }]), 400))
      .toBeUndefined()
    expect(tailLineOf(assistant([{ type: 'reasoning', text: 'only thought' }]), 400)).toBeUndefined()
  })

  it('names the tool a call ran and cuts a long line at the cap', () => {
    expect(tailLineOf(event('tool/call', {
      turn: 1, step: 1, callId: 'call-1', name: 'write', arguments: '{"filePath":"a.ts"}',
    } as never, 4), 400)).toEqual({
      seq: 4, time: 4, kind: 'tool', name: 'write', text: '{"filePath":"a.ts"}',
    })

    expect(tailLineOf(event('tool/call', {
      turn: 1, step: 1, callId: 'call-1', name: 'write', arguments: 'x'.repeat(12),
    } as never, 5), 8)).toEqual({
      seq: 5, time: 5, kind: 'tool', name: 'write', text: 'xxxxxxxx', truncated: true,
    })
  })

  it('reads a result through its nested text and skips every other event', () => {
    const result = event('tool/result', {
      turn: 1,
      step: 1,
      message: {
        id: 'r',
        role: 'user',
        content: [{
          type: 'tool-result',
          toolCallId: 'call-1',
          content: [{ type: 'text', text: 'wrote a.ts' }, { type: 'image', source: {} }],
        }],
        source: { kind: 'tool', callId: 'call-1' },
      },
    } as never, 6)
    expect(tailLineOf(result, 400)).toEqual({ seq: 6, time: 6, kind: 'tool-result', text: 'wrote a.ts' })

    const title = event('session/title', {
      title: 'lead', messageSeqs: [], source: { kind: 'fallback' },
    }, 7)
    expect(tailLineOf(title, 400)).toBeUndefined()
  })
})
