/** Project a member's own Session events into the lines a tail shows. */

import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { TeamTailLine } from './types.ts'

/** Join a message's model-facing text, ignoring blocks a tail cannot show. */
function textOf(content: readonly ContentBlock[]): string {
  const parts: string[] = []
  for (const block of content) {
    // Reasoning, images, and call/result envelopes are not this line's text:
    // the first is not the member's answer, and the rest have no prose.
    if (block.type === 'text') parts.push(block.text)
    if (block.type === 'tool-result') {
      for (const nested of block.content) if (nested.type === 'text') parts.push(nested.text)
    }
  }
  return parts.join('\n').trim()
}

/** Cut one line's text at the cap, reporting whether anything was dropped. */
function cut(text: string, maxLength: number): { text: string; truncated?: true } {
  if (text.length <= maxLength) return { text }
  return { text: text.slice(0, maxLength), truncated: true }
}

/**
 * Project one Session event into a tail line.
 * @param event - one event from the member's own Session log.
 * @param maxLength - UTF-16 units retained before the line's text is cut.
 * @returns the line, or undefined for events a tail does not show.
 */
export function tailLineOf(event: SessionEvent, maxLength: number): TeamTailLine | undefined {
  const at = { seq: event.seq, time: event.time }
  if (event.type === 'assistant/message') {
    const text = textOf(event.data.message.content)
    // An assistant step that only called tools has no prose of its own; the
    // calls it made are their own lines.
    if (text === '') return undefined
    return { ...at, kind: 'assistant', ...cut(text, maxLength) }
  }
  if (event.type === 'tool/call') {
    return { ...at, kind: 'tool', name: event.data.name, ...cut(event.data.arguments, maxLength) }
  }
  if (event.type === 'tool/result') {
    // A result block carries its call id, not the tool's name. The `tool/call`
    // line sits directly beside it in the tail and already names the tool, so
    // correlating them here would only repeat what the reader can see.
    return { ...at, kind: 'tool-result', ...cut(textOf(event.data.message.content), maxLength) }
  }
  return undefined
}
