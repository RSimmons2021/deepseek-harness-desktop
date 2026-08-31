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
    list: vi.fn(() => ok([{ key: 'openai-codex', label: 'OpenAI Codex', methods: [{ id: 'oauth', label: 'OAuth' }], subscription: true, inFlight: false }])),
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
    render(<SignInCard api={api} t={t} readOnly={false} onAuthorized={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: en.signIn }))
    await waitFor(() => { expect(screen.getByRole('link', { name: en.signInOpen })).toBeTruthy() })
    // The first method is the flow's preferred one.
    expect((api as unknown as { begin: ReturnType<typeof vi.fn> }).begin)
      .toHaveBeenCalledWith('openai-codex', 'oauth')
  })

  it('leads with the subscription grants and keeps the rest alphabetical', async () => {
    const list = vi.fn(() => ok([
      { key: 'a-keys', label: 'A Keys', methods: [{ id: 'api-key', label: 'Key' }], subscription: false, inFlight: false },
      { key: 'z-plan', label: 'Z Plan', methods: [{ id: 'oauth', label: 'OAuth' }], subscription: true, inFlight: false },
      { key: 'b-keys', label: 'B Keys', methods: [{ id: 'api-key', label: 'Key' }], subscription: false, inFlight: false },
    ]))
    render(<SignInCard api={wire({ list })} t={t} readOnly={false} onAuthorized={() => {}} />)
    await screen.findByText('Z Plan')
    const labels = screen.getAllByRole('listitem').map(item => item.textContent?.replace(en.signIn, ''))
    expect(labels).toEqual(['Z Plan', 'A Keys', 'B Keys'])
  })

  it('shows the running attempt inside the row it was started from', async () => {
    const list = vi.fn(() => ok([
      { key: 'first', label: 'First', methods: [{ id: 'oauth', label: 'OAuth' }], subscription: true, inFlight: false },
      { key: 'second', label: 'Second', methods: [{ id: 'oauth', label: 'OAuth' }], subscription: true, inFlight: false },
    ]))
    const begin = vi.fn(() => ok({ key: 'second', phase: 'running', notice: { message: 'Open it', url: 'https://auth.example' } }))
    render(<SignInCard api={wire({ list, begin, poll: vi.fn(() => ok({ key: 'second', phase: 'running' })) })} t={t} readOnly={false} onAuthorized={() => {}} />)
    await screen.findByText('Second')
    fireEvent.click(screen.getAllByRole('button', { name: en.signIn })[1]!)

    // A long catalog put the attempt below every row; it belongs in its own.
    const link = await screen.findByRole('link', { name: en.signInOpen })
    const row = link.closest('li')
    expect(row?.textContent).toContain('Second')
    expect(row?.textContent).not.toContain('First')
  })

  it('reports the route a committed grant belongs to, so the page can declare it', async () => {
    const onAuthorized = vi.fn()
    const api = wire({
      list: vi.fn(() => ok([{ key: 'llm-pi-ai/openai-codex', label: 'OpenAI Codex', methods: [{ id: 'oauth', label: 'OAuth' }], subscription: true, inFlight: false }])),
      begin: vi.fn(() => ok({ key: 'llm-pi-ai/openai-codex', phase: 'running' })),
      poll: vi.fn(() => ok({ key: 'llm-pi-ai/openai-codex', phase: 'authorized' })),
    })
    render(<SignInCard api={api} t={t} readOnly={false} onAuthorized={onAuthorized} />)
    fireEvent.click(await screen.findByRole('button', { name: en.signIn }))
    // The record's scope names the plugin; the route is the segment after it.
    await waitFor(() => { expect(onAuthorized).toHaveBeenCalledWith('openai-codex') })
  })

  it('renders nothing while no flow is registered', async () => {
    const { container } = render(<SignInCard api={wire({ list: vi.fn(() => ok([])) })} t={t} readOnly={false} onAuthorized={() => {}} />)
    await waitFor(() => { expect(container.firstChild).toBeNull() })
  })

  it('reports a refused list instead of vanishing, so a missing seam is visible', async () => {
    const refused = vi.fn(() => Promise.resolve({
      ok: false as const,
      error: { code: 'unavailable', message: 'no authorization provider is mounted', details: {} },
    }))
    render(<SignInCard api={wire({ list: refused })} t={t} readOnly={false} onAuthorized={() => {}} />)
    expect(await screen.findByText('no authorization provider is mounted')).toBeTruthy()
  })

  it('offers no sign-in while the settings provider is read-only', async () => {
    render(<SignInCard api={wire()} t={t} readOnly onAuthorized={() => {}} />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: en.signIn }).hasAttribute('disabled')).toBe(true)
    })
  })
})
