// @vitest-environment jsdom

/** Behaviour of the Models page's interactive sign-in card. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SignInCard } from '../src/client/SignInCard.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const t = ((key: keyof typeof en) => en[key]) as never
const ok = <T,>(value: T) => Promise.resolve({ ok: true as const, value })

/** A wire whose list answers with one flow and whose attempt starts running. */
function wire(overrides: Record<string, unknown> = {}) {
  return {
    list: vi.fn(() => ok([{ key: 'openai-codex', label: 'OpenAI Codex', methods: [{ id: 'oauth', label: 'OAuth' }], inFlight: false }])),
    begin: vi.fn(() => ok({ key: 'openai-codex', phase: 'running', notice: { message: 'Open the page', url: 'https://auth.example' } })),
    poll: vi.fn(() => ok({ key: 'openai-codex', phase: 'authorized' })),
    answer: vi.fn(() => ok({ key: 'openai-codex', phase: 'running' })),
    cancel: vi.fn(() => ok({ key: 'openai-codex', phase: 'cancelled' })),
    ...overrides,
  } as never
}

describe('SignInCard', () => {
  it('starts an attempt on the flow it was given and shows the page to open', async () => {
    const api = wire()
    render(<SignInCard api={api} t={t} readOnly={false} />)
    fireEvent.click(await screen.findByRole('button', { name: en.signIn }))
    await waitFor(() => { expect(screen.getByRole('link', { name: en.signInOpen })).toBeTruthy() })
    // The first method is the flow's preferred one.
    expect((api as unknown as { begin: ReturnType<typeof vi.fn> }).begin)
      .toHaveBeenCalledWith('openai-codex', 'oauth')
  })

  it('renders nothing while no flow is registered', async () => {
    const { container } = render(<SignInCard api={wire({ list: vi.fn(() => ok([])) })} t={t} readOnly={false} />)
    await waitFor(() => { expect(container.firstChild).toBeNull() })
  })

  it('reports a refused list instead of vanishing, so a missing seam is visible', async () => {
    const refused = vi.fn(() => Promise.resolve({
      ok: false as const,
      error: { code: 'unavailable', message: 'no authorization provider is mounted', details: {} },
    }))
    render(<SignInCard api={wire({ list: refused })} t={t} readOnly={false} />)
    expect(await screen.findByText('no authorization provider is mounted')).toBeTruthy()
  })

  it('offers no sign-in while the settings provider is read-only', async () => {
    render(<SignInCard api={wire()} t={t} readOnly />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: en.signIn }).hasAttribute('disabled')).toBe(true)
    })
  })
})
