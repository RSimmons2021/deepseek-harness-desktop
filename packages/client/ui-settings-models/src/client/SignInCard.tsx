/**
 * Sign-in block for providers that offer an interactive login.
 *
 * `ctx.authorization.begin()` hands the flow callbacks it calls while it runs,
 * and a wire cannot carry a callback, so the `authorization` namespace turns
 * that into state: begin starts the attempt, poll reports the newest notice or
 * the question the flow is waiting on, answer settles it, cancel withdraws it.
 * This card is the polling half. It never renders a secret — the flow reports
 * pages and codes, and the committed credential stays in the credential store.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AuthorizationFlowView, AuthorizationStateView } from '@deepseek-ai/dsh-api-settings-controller/types'
import type { en } from './locales.ts'
import type { ModelsAuthorization } from './store.ts'
import css from './SignInCard.module.css'

/** Gap between polls while an attempt runs. Fast enough to follow a browser round trip. */
const POLL_INTERVAL_MS = 700

/** Sign-in card props. */
export interface SignInCardProps {
  /** Authorization Remote face. */
  api: ModelsAuthorization
  /** Section copy. */
  t: (key: keyof typeof en) => string
  /** Disable starting an attempt (read-only settings provider). */
  readOnly: boolean
  /**
   * A sign-in committed its credential. Signing in does not by itself make the
   * provider usable — the adapter runs the routes the settings document
   * declares, and a grant with no route is a credential nothing reads — so the
   * page is told which route the new credential belongs to.
   */
  onAuthorized: (route: string) => void
}

/**
 * Render the registered sign-in flows and drive one attempt at a time.
 * @param props - the Remote face, the localizer, and the read-only flag.
 * @returns the card, or nothing while no flow is registered.
 */
export function SignInCard({ api, t, readOnly, onAuthorized }: SignInCardProps) {
  const [flows, setFlows] = useState<AuthorizationFlowView[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [state, setState] = useState<AuthorizationStateView | null>(null)
  const [answer, setAnswer] = useState('')
  const active = useRef<string | null>(null)

  const loadFlows = useCallback(async (): Promise<void> => {
    const result = await api.list()
    // A composition without the authorization seam refuses rather than
    // answering. Report that instead of rendering nothing: an empty card and a
    // refused call look identical from the outside, and the difference is
    // exactly what a person debugging their setup needs.
    setFlows(result.ok ? result.value : [])
    setListError(result.ok ? null : result.error.message)
  }, [api])

  useEffect(() => { void loadFlows() }, [loadFlows])

  // Follow the running attempt. The flow settles on a person's schedule, so the
  // card polls rather than holding a request open across the whole sign-in.
  useEffect(() => {
    if (state?.phase !== 'running') return
    const key = state.key
    // Unmounting ends the poll: the card owns the loop, and a settled attempt
    // that lands after the card is gone has nothing left to render into.
    const polling = new AbortController()
    // Read through a call: TypeScript keeps a property read narrowed across the
    // awaits below, and each re-check exists because the card can unmount while
    // one is outstanding.
    const stopped = (): boolean => polling.signal.aborted
    const tick = async (): Promise<void> => {
      while (!stopped()) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
        if (stopped()) return
        const result = await api.poll(key)
        if (stopped() || !result.ok) return
        setState(result.value)
        if (result.value.phase !== 'running') {
          // The record's scope names the owning plugin; the segment after it is
          // the adapter's route id.
          if (result.value.phase === 'authorized') {
            onAuthorized(key.slice(key.indexOf('/') + 1))
          }
          await loadFlows()
          return
        }
      }
    }
    void tick()
    return () => { polling.abort() }
  }, [api, loadFlows, onAuthorized, state?.phase, state?.key])

  const start = useCallback(async (flow: AuthorizationFlowView): Promise<void> => {
    active.current = flow.key
    setAnswer('')
    const method = flow.methods[0]?.id
    const result = method === undefined
      ? await api.begin(flow.key)
      : await api.begin(flow.key, method)
    if (result.ok) setState(result.value)
  }, [api])

  const submit = useCallback(async (): Promise<void> => {
    if (state === null) return
    const result = await api.answer(state.key, answer)
    setAnswer('')
    if (result.ok) setState(result.value)
  }, [answer, api, state])

  const stop = useCallback(async (): Promise<void> => {
    if (state === null) return
    const result = await api.cancel(state.key)
    if (result.ok) setState(result.value)
    await loadFlows()
  }, [api, loadFlows, state])

  if (flows === null || (flows.length === 0 && listError === null)) return null

  // Subscription grants lead: they spend a plan someone already holds, and the
  // rest of the catalog ships a login too, so an unsorted list buries them.
  const ordered = [...flows].sort((left, right) => {
    if (left.subscription !== right.subscription) return left.subscription ? -1 : 1
    return left.label.localeCompare(right.label)
  })

  /** The attempt block for the row that owns it, so it appears where it was started. */
  const attemptFor = (key: string) => {
    if (state === null || state.key !== key || state.phase === 'idle') return null
    return (
      <div className={css.attempt} role="status">
        {state.notice !== undefined && (
          <p className={css.notice}>
            {state.notice.message}
            {state.notice.url !== undefined && (
              <a className={css.link} href={state.notice.url} target="_blank" rel="noreferrer">
                {t('signInOpen')}
              </a>
            )}
            {state.notice.code !== undefined && <code className={css.code}>{state.notice.code}</code>}
          </p>
        )}

        {state.question !== undefined && state.question.kind === 'select' && (
          <div className={css.answerRow}>
            {(state.question.options ?? []).map(option => (
              <button
                key={option.id}
                type="button"
                className={css.action}
                onClick={() => {
                  void api.answer(state.key, option.id).then((result) => {
                    if (result.ok) setState(result.value)
                  })
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}

        {state.question !== undefined && state.question.kind !== 'select' && (
          <div className={css.answerRow}>
            <input
              type={state.question.kind === 'secret' ? 'password' : 'text'}
              value={answer}
              placeholder={state.question.placeholder ?? state.question.message}
              aria-label={state.question.message}
              onChange={(event) => { setAnswer(event.target.value) }}
            />
            <button type="button" className={css.action} onClick={() => { void submit() }}>
              {t('signInAnswer')}
            </button>
          </div>
        )}

        {state.phase === 'running' && (
          <button type="button" className={css.action} onClick={() => { void stop() }}>
            {t('signInCancel')}
          </button>
        )}
        {state.phase === 'authorized' && <p className={css.done}>{t('signInAuthorized')}</p>}
        {state.phase === 'cancelled' && <p className={css.done}>{t('signInCancelled')}</p>}
        {state.phase === 'failed' && (
          <p className={css.failed}>{t('signInFailed')}{state.error === undefined ? '' : `: ${state.error}`}</p>
        )}
      </div>
    )
  }

  return (
    <section className={css.card} aria-labelledby="models-signin-heading">
      <h3 id="models-signin-heading" className={css.title}>{t('signInTitle')}</h3>
      <p className={css.description}>{t('signInDescription')}</p>
      {listError !== null && <p className={css.failed}>{listError}</p>}
      {listError === null && flows.length === 0 && <p className={css.description}>{t('signInNone')}</p>}

      <ul className={css.flows}>
        {ordered.map((flow) => {
          const running = state?.key === flow.key && state.phase === 'running'
          return (
            <li key={flow.key} className={css.flow} data-subscription={flow.subscription || undefined}>
              <div className={css.flowRow}>
                <span className={css.flowLabel}>{flow.label}</span>
                <button
                  type="button"
                  className={css.action}
                  disabled={readOnly || running || flow.inFlight}
                  onClick={() => { void start(flow) }}
                >
                  {running || flow.inFlight ? t('signInBusy') : t('signIn')}
                </button>
              </div>
              {attemptFor(flow.key)}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
