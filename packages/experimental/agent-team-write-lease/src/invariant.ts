/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-experimental-agent-team-write-lease`.
 * @module @deepseek-ai/dsh-experimental-agent-team-write-lease/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-experimental-agent-team-write-lease'

/** Cordis companion plugin name. */
export const name = 'agent-team-write-lease-invariant'
/** Service required before the companion can register. */
export const inject = ['invariants']

// No runtime invariant: this package owns no mutable data and no event stream.
// It registers two decisions whose authority is the Team service's task board,
// where the scope-ownership relationship lives and is already checked.
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
