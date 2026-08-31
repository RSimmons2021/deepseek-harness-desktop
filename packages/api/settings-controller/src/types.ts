/**
 * Browser-safe failure vocabulary of the configuration surfaces this package
 * serves. The redacted views themselves live with their seam in
 * `@deepseek-ai/dsh-settings/types`, whose Cordis event declarations already
 * register that file for the Client compilation face.
 *
 * @module @deepseek-ai/dsh-api-settings-controller/types
 */

/** Stable settings failure details returned by the `settings` namespace. */
export interface SettingsErrorDetailsMap {
  /**
   * Every seam refusal that is not a stale write: an unregistered or malformed
   * namespace, a read-only provider, schema validation, storage.
   */
  'settings-rejected': { readonly ns: string }
  /**
   * The stored revision moved after the caller read it. Its own outcome rather
   * than an invalid request: the caller must re-read and re-apply.
   */
  'settings-conflict': { readonly ns: string; readonly expected: number; readonly actual: number }
}

/** Settings business failure carried by a rejected Remote call. */
export type SettingsError = {
  [Code in keyof SettingsErrorDetailsMap]: {
    readonly code: Code
    readonly message: string
    readonly details: SettingsErrorDetailsMap[Code]
  }
}[keyof SettingsErrorDetailsMap]

/** Confirmation that the settings document was handed to the native editor. */
export interface SettingsDocumentOpenValue {
  readonly opened: true
}

/** Result of opening or revealing one locally authored Agent preset directory. */
export type AgentPresetDirectoryOpenValue =
  | { readonly opened: true }
  | { readonly opened: false; readonly path: string }

/** Stable credential failure details returned by the `credentials` namespace. */
export interface CredentialErrorDetailsMap {
  /**
   * The provider refused a valid write, for example because a read-only source
   * shadows the reference. The details name only the reference, never the value.
   */
  'credential-rejected': { readonly ref: string }
}

/** Credential business failure carried by a rejected Remote call. */
export type CredentialError = {
  [Code in keyof CredentialErrorDetailsMap]: {
    readonly code: Code
    readonly message: string
    readonly details: CredentialErrorDetailsMap[Code]
  }
}[keyof CredentialErrorDetailsMap]

/** One method a sign-in flow accepts, as a configuration page offers it. */
export interface AuthorizationMethodView {
  /** Value echoed back when a page picks this method. */
  id: string
  /** User-facing label. */
  label: string
}

/** One registered sign-in flow, as a configuration page lists it. */
export interface AuthorizationFlowView {
  /** Credential record this flow writes, as a wire-safe string. */
  key: string
  /** User-facing name of what is being authorized. */
  label: string
  /** Methods this flow accepts, most preferred first. */
  methods: AuthorizationMethodView[]
  /** Whether signing in here spends a subscription rather than issuing a key. */
  subscription: boolean
  /** Whether an attempt for this key is already running. */
  inFlight: boolean
}

/** One option of a `select` question. */
export interface AuthorizationQuestionOption {
  /** Value returned when this option is chosen. */
  id: string
  /** User-facing label. */
  label: string
  /** Extra context a capable surface renders. */
  description?: string
}

/**
 * A question the flow is waiting on. `secret` differs from `text` only in
 * presentation, and `select` answers with the chosen option's id.
 */
export interface AuthorizationQuestion {
  /** How the answer should be collected. */
  kind: 'text' | 'secret' | 'select'
  /** What to ask. */
  message: string
  /** Placeholder for the free-text kinds. */
  placeholder?: string
  /** Choices for the `select` kind. */
  options?: AuthorizationQuestionOption[]
}

/** Where one attempt stands. `idle` means no attempt has run for this key. */
export type AuthorizationPhase = 'idle' | 'running' | 'authorized' | 'cancelled' | 'failed'

/** One attempt's newest state, as a configuration page polls it. */
export interface AuthorizationStateView {
  /** Credential record this attempt authorizes. */
  key: string
  /** Where the attempt stands. */
  phase: AuthorizationPhase
  /** Newest report from the flow, including any page to open. */
  notice?: { message: string; url?: string; code?: string }
  /** The question awaiting an answer, when the flow is asking one. */
  question?: AuthorizationQuestion
  /** Message of the failure that ended the attempt. */
  error?: string
}
