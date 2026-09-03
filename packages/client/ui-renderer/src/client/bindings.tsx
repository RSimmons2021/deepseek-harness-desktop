/** Internal React bindings for renderer hosts and standard-source scopes. */
import { createContext, useContext, type ReactNode } from 'react'
import type {
  HostObservable,
  KeyedStandardSource,
  MaybeSnapshotSelectorHook,
  SlotRendererHost,
  SnapshotSelectorHook,
  StandardSourceBinding,
} from '@deepseek-ai/dsh-client-ui-slots'
import { bindSnapshotSelector } from './bind.ts'

/** Missing renderer assembly dependency. */
export class SlotAssemblyError extends Error {}

/** In-package renderer host context. */
export const HostContext = createContext<SlotRendererHost | null>(null)

/**
 * Read the installed renderer host.
 * @returns the host API.
 */
export function useHost(): SlotRendererHost {
  const host = useContext(HostContext)
  if (host === null) throw new SlotAssemblyError('slot machinery rendered outside the installed renderer tree')
  return host
}

const RootBindingContext = createContext<StandardSourceBinding | null>(null)
const ScopeBindingContext = createContext<StandardSourceBinding | null>(null)

/**
 * Read the root standard-source binding.
 * @returns the current root binding.
 */
export function useRootBinding(): StandardSourceBinding {
  const binding = useContext(RootBindingContext)
  if (binding === null) throw new SlotAssemblyError('slot rendered outside the root standard-source provider')
  return binding
}

/**
 * Read the current-session-optional binding.
 * @returns a binding whose key is absent when no Session is selected.
 */
export function useScopeBinding(): StandardSourceBinding {
  const binding = useContext(ScopeBindingContext)
  if (binding === null) throw new SlotAssemblyError('scoped slot rendered outside its scope provider')
  return binding
}

/**
 * Bind one observable source to an identity-stable selector Hook.
 * @param source - observable source.
 * @returns cached selector Hook.
 */
export function observableHook<T>(source: HostObservable<T>): SnapshotSelectorHook<T> {
  let hook = hookCache.get(source)
  if (hook === undefined) {
    hook = bindSnapshotSelector(source)
    hookCache.set(source, hook)
  }
  return hook as SnapshotSelectorHook<T>
}

const hookCache = new WeakMap<object, unknown>()
const absentSource: HostObservable<undefined> = {
  getSnapshot: () => undefined,
  subscribe: () => () => {},
}

/**
 * Bind an optional source without changing Hook call order.
 * @param source - current source, or absence.
 * @returns selector Hook returning `undefined` while absent.
 */
export function maybeObservableHook<T>(
  source: HostObservable<T> | undefined,
): MaybeSnapshotSelectorHook<T> {
  if (source !== undefined) return observableHook(source)
  return useAbsentSnapshot
}

function useAbsentSnapshot<S>(
  _selector: (snapshot: never) => S,
  _equal?: (left: S, right: S) => boolean,
): S | undefined {
  observableHook(absentSource)(() => undefined)
  return undefined
}

/** Erased open-key selector Hook synthesized from one keyed source family. */
export type KeyedSnapshotHook = (
  key: string,
  selector?: (value: unknown) => unknown,
  equal?: (left: unknown, right: unknown) => boolean,
) => unknown

/**
 * Bind an open-key source family.
 * @param source - keyed resolver, or absence for an optional scope.
 * @returns cached keyed selector Hook.
 */
export function keyedObservableHook(source: KeyedStandardSource | undefined): KeyedSnapshotHook {
  if (source === undefined) return absentKeyedHook
  let hook = keyedHookCache.get(source)
  if (hook === undefined) {
    hook = (key, selector, equal) => {
      const useValue = observableHook(source(key) ?? absentSource)
      return useValue(selector ?? identity, equal)
    }
    keyedHookCache.set(source, hook)
  }
  return hook
}

const keyedHookCache = new WeakMap<KeyedStandardSource, KeyedSnapshotHook>()
const identity = (value: unknown): unknown => value
const absentKeyedHook: KeyedSnapshotHook = (_key, selector, equal) =>
  observableHook(absentSource)(selector ?? identity, equal)

/** Subscribe the tree to the atomically assembled root standard-source roster. */
export function RootStandardProvider({ children }: { children: ReactNode }) {
  const host = useHost()
  const binding = observableHook(host.root)(value => value)
  return <RootBindingContext.Provider value={binding}>{children}</RootBindingContext.Provider>
}

/*
 * Scopes this host has installed at least once. A scope adapter belongs to the
 * plugin that installed it, so it can go away while the tree is still mounted:
 * reloading a patch layer disposes ui-session, and the root provider re-renders
 * in the gap before the replacement installs. Throwing there would take the
 * whole application down — renderRoot wraps the root outlet in this provider,
 * and SlotErrorBoundary rethrows assembly errors by design — for a state the
 * composition closes by itself. A scope this host has never installed is a
 * miswired shell instead, and still fails loud; RootOutlet draws the same line
 * between a registration that went away and one that never arrived.
 */
const installedScopes = new WeakMap<SlotRendererHost, Set<string>>()

/**
 * Subscribe to the scope roster before resolving and binding its current
 * adapter. Renders nothing while an installed adapter is between owners.
 */
export function ScopeProvider({
  scope,
  children,
}: {
  scope: 'session' | 'session-maybe'
  children: ReactNode
}) {
  const host = useHost()
  observableHook(host.scopeRevision)(value => value)
  const adapter = host.scope(scope)
  if (adapter === undefined) {
    // Absence keeps the Hook order identical to the installed path below.
    observableHook(absentSource)(value => value)
    if (installedScopes.get(host)?.has(scope) !== true) {
      throw new SlotAssemblyError(`scope '${scope}' rendered without an installed adapter`)
    }
    return null
  }
  const binding = observableHook(adapter.current)(value => value)
  let installed = installedScopes.get(host)
  if (installed === undefined) {
    installed = new Set<string>()
    installedScopes.set(host, installed)
  }
  installed.add(scope)
  return <ScopeBindingContext.Provider value={binding}>{children}</ScopeBindingContext.Provider>
}
