/**
 * Host owner of the `authorization` Remote namespace: interactive credential
 * flows as a browser configuration page drives them.
 *
 * `ctx.authorization.begin()` takes callbacks the flow calls while it runs, and
 * a wire cannot carry a callback. This namespace turns that shape into state a
 * page can poll: `begin` starts the attempt and returns immediately, `poll`
 * reports the newest notice or the question the flow is waiting on, `answer`
 * settles that question, and `cancel` withdraws the attempt. One attempt per
 * key, which is the same bound the service itself keeps.
 *
 * @module @deepseek-ai/dsh-api-settings-controller/src/authorization.ts
 */

import { Context } from '@deepseek-ai/cordis'
import type { CredentialKey } from '@deepseek-ai/dsh-credentials/types'
import type {} from '@deepseek-ai/dsh-authorization'
import type {
  AuthorizationNotice,
  AuthorizationPrompt,
} from '@deepseek-ai/dsh-authorization/types'
import { Remote, TypertRemoteFailure, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import type {
  AuthorizationFlowView,
  AuthorizationPhase,
  AuthorizationQuestion,
  AuthorizationStateView,
} from './types.ts'

const keySchema = z.string().min(1).max(200)
const beginSchema = z.object({ key: keySchema, method: z.string().min(1).max(200).optional() })
const answerSchema = z.object({ key: keySchema, value: z.string().max(4096) })

/** Parse the domain constraints that are more specific than generated TypeScript codecs. */
function parseRequest<T>(method: string, schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw new TypertRemoteFailure({
      code: 'bad-request',
      message: `invalid payload for ${method}`,
      details: { issues: parsed.error.issues },
    })
  }
  return parsed.data
}

/** One attempt this namespace is driving on a page's behalf. */
interface Attempt {
  phase: AuthorizationPhase
  notice?: AuthorizationNotice | undefined
  question?: AuthorizationQuestion | undefined
  /** Settles the question the flow is waiting on. */
  answer?: ((value: string) => void) | undefined
  /** Refuses the question, which the flow reports as a decline. */
  decline?: ((reason: Error) => void) | undefined
  /** Message of the failure that ended the attempt. */
  error?: string | undefined
  readonly controller: AbortController
}

/** Project a prompt into the wire shape, dropping its abort signal. */
function questionOf(prompt: AuthorizationPrompt): AuthorizationQuestion {
  if (prompt.kind === 'select') {
    return {
      kind: 'select',
      message: prompt.message,
      options: prompt.options.map(option => ({
        id: option.id,
        label: option.label,
        ...option.description === undefined ? {} : { description: option.description },
      })),
    }
  }
  return {
    kind: prompt.kind,
    message: prompt.message,
    ...prompt.placeholder === undefined ? {} : { placeholder: prompt.placeholder },
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host owner of the `authorization` Remote namespace. */
    authorizationController: AuthorizationController
  }
}

/**
 * Host service backing the generated `ctx.remote.authorization` namespace.
 * Registered whether or not the authorization seam is mounted, so a page that
 * asks without it gets an actionable refusal rather than a missing method.
 */
export class AuthorizationController extends TypertRemoteService {
  // No `static inject`: the seam is optional and read per call through
  // `ctx.get`, the same way the credentials namespace reads its provider. A
  // declared injection would gate this service on a seam a composition is
  // allowed not to mount, and the namespace has to stay registered so a page
  // that asks gets the actionable refusal instead of a missing method.
  private readonly attempts = new Map<string, Attempt>()

  /**
   * Register the authorization namespace.
   * @param ctx - host context carrying the optional authorization seam.
   */
  constructor(ctx: Context) {
    super(ctx, 'authorizationController', { namespace: 'authorization' })
    ctx.effect(() => () => {
      for (const attempt of this.attempts.values()) attempt.controller.abort()
      this.attempts.clear()
    }, 'authorization-controller: withdraw attempts on teardown')
  }

  /** Resolve the seam, or refuse with the reason a page can act on. */
  private seam(): NonNullable<Context['authorization']> {
    const authorization = this.ctx.get('authorization')
    if (authorization === undefined) {
      throw new TypertRemoteFailure({
        code: 'unavailable',
        message: 'no authorization provider is mounted; sign-in flows cannot run',
        details: {},
      })
    }
    return authorization
  }

  /**
   * List the flows a page can offer to sign into.
   * @returns one row per registered flow, with the methods it accepts.
   */
  @Remote
  list(): AuthorizationFlowView[] {
    return this.seam().list().map(entry => ({
      key: String(entry.key),
      label: entry.label,
      methods: entry.methods.map(method => ({ id: method.id, label: method.label })),
      subscription: entry.subscription,
      inFlight: entry.inFlight,
    }))
  }

  /**
   * Start one attempt and return without waiting for the human.
   *
   * The attempt outlives this call: a sign-in takes as long as a person takes,
   * and a request held open for that would time out on any transport. The page
   * follows it through {@link poll}.
   * @param key - the credential the attempt authorizes.
   * @param method - which sign-in method to run; the adapter's own choice when absent.
   * @returns the state the attempt starts in.
   */
  @Remote
  begin(key: string, method?: string): AuthorizationStateView {
    const request = parseRequest('authorization.begin', beginSchema, {
      key,
      ...method === undefined ? {} : { method },
    })
    const { key: parsedKey, method: parsedMethod } = request
    const authorization = this.seam()
    if (this.attempts.get(parsedKey)?.phase === 'running') return this.view(parsedKey)

    const controller = new AbortController()
    const attempt: Attempt = { phase: 'running', controller }
    this.attempts.set(parsedKey, attempt)

    // Deliberately not awaited: the promise settles when the human finishes.
    void authorization.begin({
      key: parsedKey as CredentialKey,
      ...parsedMethod === undefined ? {} : { method: parsedMethod },
      signal: controller.signal,
      interaction: {
        notify: (notice: AuthorizationNotice) => {
          attempt.notice = notice
        },
        prompt: async (prompt: AuthorizationPrompt) => await new Promise<string>((resolve, reject) => {
          attempt.question = questionOf(prompt)
          attempt.answer = (value) => {
            attempt.question = undefined
            attempt.answer = undefined
            attempt.decline = undefined
            resolve(value)
          }
          attempt.decline = (reason) => {
            attempt.question = undefined
            attempt.answer = undefined
            attempt.decline = undefined
            reject(reason)
          }
        }),
      },
    }).then(
      (outcome) => { attempt.phase = outcome.status },
      (error: unknown) => {
        attempt.phase = 'failed'
        attempt.error = error instanceof Error ? error.message : String(error)
      },
    )
    return this.view(parsedKey)
  }

  /**
   * Read the attempt's newest state.
   * @param key - the credential record whose attempt to report on.
   * @returns the phase, the newest notice, and any question awaiting an answer.
   */
  @Remote
  poll(key: string): AuthorizationStateView {
    return this.view(parseRequest('authorization.poll', keySchema, key))
  }

  /**
   * Answer the question the flow is waiting on.
   * @param key - the credential whose attempt is waiting.
   * @param value - the human's answer to the question the flow asked.
   * @returns the state after the answer was delivered.
   */
  @Remote
  answer(key: string, value: string): AuthorizationStateView {
    const request = parseRequest('authorization.answer', answerSchema, { key, value })
    const attempt = this.attempts.get(request.key)
    if (attempt?.answer === undefined) {
      throw new TypertRemoteFailure({
        code: 'bad-request',
        message: 'no question is awaiting an answer for this credential',
        details: {},
      })
    }
    attempt.answer(request.value)
    return this.view(request.key)
  }

  /**
   * Withdraw the attempt, which the flow reports as a cancellation.
   * @param key - the credential record whose attempt to withdraw.
   * @returns the state after the withdrawal was requested.
   */
  @Remote
  cancel(key: string): AuthorizationStateView {
    const parsed = parseRequest('authorization.cancel', keySchema, key)
    const attempt = this.attempts.get(parsed)
    if (attempt !== undefined) {
      attempt.decline?.(new Error('the sign-in was cancelled'))
      attempt.controller.abort()
    }
    this.seam().cancel(parsed as CredentialKey)
    return this.view(parsed)
  }

  /** Project one attempt for the wire; an unknown key reads as idle. */
  private view(key: string): AuthorizationStateView {
    const attempt = this.attempts.get(key)
    if (attempt === undefined) return { key, phase: 'idle' }
    return {
      key,
      phase: attempt.phase,
      ...attempt.notice === undefined ? {} : { notice: attempt.notice },
      ...attempt.question === undefined ? {} : { question: attempt.question },
      ...attempt.error === undefined ? {} : { error: attempt.error },
    }
  }
}
