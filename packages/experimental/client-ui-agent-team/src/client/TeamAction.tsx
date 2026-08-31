import { Fragment, useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  AnimatePresence, motion, useReducedMotion, type Transition,
} from 'motion/react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  RemoteSendTeamMessageRequest,
  RemoteSpawnTeammateRequest,
  TeamActivityEntry,
  TeamActivityKind,
  TeamMemberEffort,
  TeamMemberView as TeamRosterMember,
  TeamMessageMutationResult,
  TeamSpawnMutationResult,
  TeamInterruptMutationResult,
  TeamTaskAction,
  TeamTaskId,
  TeamTaskMutationResult,
  TeamTaskView as TeamTask,
  TeamView,
  TeamWaitResult,
} from '@deepseek-ai/dsh-experimental-agent-team/client'
import type { RemoteFailure, RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import {
  IconCheckOutline14, IconCloseOutline16, IconEditOutline16, IconPlusOutline16,
  IconDarkOutline16, IconLightOutline16, IconPauseOutline16, IconPlayOutline16,
  IconNewChatOutline16, IconRefreshOutline14, IconTrashOutline16,
  IconUserOutline16, StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  HostObservable, InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { Loader } from './Loader.tsx'
import { TextShimmer } from './TextShimmer.tsx'
import { NS, type TeamKey } from './locales.ts'
import css from './TeamAction.module.css'

/** Generated Remote result consumed directly by the Team UI. */
export type TeamActionResult<T> = RemoteResult<T>

/** Generated Remote result whose business value preserves Team task rejections. */
export type TeamTaskActionResult = RemoteResult<TeamTaskMutationResult>

/** Generated Remote result whose business value preserves Team interrupt rejections. */
export type TeamInterruptActionResult = RemoteResult<TeamInterruptMutationResult>

/** Generated Remote result whose business value preserves Team spawn rejections. */
export type TeamSpawnActionResult = RemoteResult<TeamSpawnMutationResult>

/** Generated Remote result whose business value preserves Team message rejections. */
export type TeamMessageActionResult = RemoteResult<TeamMessageMutationResult>

/** Business actions injected by the browser plugin. */
export interface TeamActionInjected {
  hooks: {
    /** Resolved appearance (`system` already mapped to light or dark). */
    colorScheme: HostObservable<'light' | 'dark'>
  }
  /** Write the opposite appearance as the durable preference. */
  toggleTheme: () => void
  load: (sessionId: SessionId) => Promise<TeamActionResult<TeamView>>
  createTask: (sessionId: SessionId, input: {
    subject: string
    description: string
    blockedBy: TeamTaskId[]
    writeScopes: string[]
  }) => Promise<TeamTaskActionResult>
  updateTask: (sessionId: SessionId, input: {
    taskId: TeamTaskId
    expectedRevision: number
    action: TeamTaskAction
    subject?: string
    description?: string
    blockedBy?: TeamTaskId[]
    writeScopes?: string[]
    owner?: string
  }) => Promise<TeamTaskActionResult>
  spawnTeammate: (
    sessionId: SessionId,
    request: RemoteSpawnTeammateRequest,
  ) => Promise<TeamSpawnActionResult>
  sendMessage: (
    sessionId: SessionId,
    request: RemoteSendTeamMessageRequest,
  ) => Promise<TeamMessageActionResult>
  interrupt: (sessionId: SessionId, targetName: string) => Promise<TeamInterruptActionResult>
  /**
   * Hold one bounded wait for the next Team change. The surface calls this in a
   * loop and reloads on every observed change, so the roster and task board
   * follow the running Team without the user asking for a refresh.
   */
  waitForChange: (sessionId: SessionId, timeoutMs: number) => Promise<TeamActionResult<TeamWaitResult>>
  /**
   * Read the Team's recorded history, newest first. The board shows where the
   * Team is now; this shows how it got there, and is the only place a completed
   * task or a delivered message survives.
   */
  activity: (sessionId: SessionId, limit: number) => Promise<TeamActionResult<TeamActivityEntry[]>>
  openTeammate: (sessionId: SessionId, member: TeamRosterMember) => Promise<void>
}

/** Full props of the Team conversation-header action. */
export type TeamActionProps =
  PropsRuntime<'conversation.session.header.actions'> & InjectFace<TeamActionInjected> & PropsLocale<typeof NS>

/** Props shared by the header action and the desktop-owned workspace surface. */
export type TeamSurfaceProps = Pick<
  TeamActionProps,
  | 'sessionId' | 'load' | 'createTask' | 'updateTask' | 'spawnTeammate'
  | 'sendMessage' | 'interrupt' | 'waitForChange' | 'activity' | 'openTeammate'
  | 'useColorScheme' | 'toggleTheme' | 't'
> & {
  /** Keep the designed Team workspace mounted as the application surface. */
  standalone?: boolean
}

interface Draft {
  subject: string
  description: string
  blockers: string
  scopes: string
}

const EMPTY_DRAFT: Draft = { subject: '', description: '', blockers: '', scopes: '' }

/** Open-seat spawn form state. The provider is absent: the service resolves it from the context mode. */
interface SpawnDraft {
  name: string
  description: string
  prompt: string
  context: 'fresh' | 'fork'
}

const EMPTY_SPAWN: SpawnDraft = { name: '', description: '', prompt: '', context: 'fresh' }

/** Tiles the roster keeps on screen so a nearly empty Team still reads as a row. */
const ROSTER_MIN_TILES = 4

/** Timeline entries kept on screen; the service caps one read at 200. */
const ACTIVITY_LIMIT = 40

/** Board lanes, in the order an operator reads them: now, next, waiting, over. */
const LANE_ORDER = ['laneActive', 'laneReady', 'laneBlocked', 'laneDone'] as const

/** Which lane one task belongs in, from its status and derived readiness. */
function laneOf(task: TeamTask): (typeof LANE_ORDER)[number] {
  if (task.status === 'completed') return 'laneDone'
  if (task.status === 'in_progress') return 'laneActive'
  return task.ready ? 'laneReady' : 'laneBlocked'
}

/** Peer-message form state. The target comes from the card the form opened on. */
interface MessageDraft {
  message: string
  delivery: 'quiet' | 'wakeup'
}

const EMPTY_MESSAGE: MessageDraft = { message: '', delivery: 'quiet' }

function items(value: string): string[] {
  return [...new Set(value.split(',').map(item => item.trim()).filter(Boolean))]
}

function taskIds(value: string): TeamTaskId[] {
  return items(value) as TeamTaskId[]
}

function failureText(error: Pick<RemoteFailure, 'code' | 'message'>): string {
  return `${error.message} (${error.code})`
}

function statusKey(status: TeamTask['status']): TeamKey {
  switch (status) {
    case 'pending': return 'status.pending'
    case 'in_progress': return 'status.in_progress'
    case 'completed': return 'status.completed'
    /* v8 ignore next -- Team views omit deleted task tombstones. */
    case 'deleted': return 'status.completed'
  }
}

/**
 * Round a duration to the largest unit that still reads as a measurement. The
 * unit names come from the dictionary, so a locale that writes them as words
 * is not forced through an English abbreviation.
 */
function formatDuration(ms: number, t: TeamSurfaceProps['t']): string {
  if (ms < 1000) return t('unitMs', { value: Math.round(ms) })
  if (ms < 60_000) return t('unitSeconds', { value: (ms / 1000).toFixed(1) })
  return t('unitMinutes', {
    minutes: Math.floor(ms / 60_000),
    seconds: Math.round((ms % 60_000) / 1000),
  })
}

/** Abbreviate a token count; a roster tile has no room for seven digits. */
function formatTokens(tokens: number): string {
  if (tokens < 1000) return String(tokens)
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}K`
  return `${(tokens / 1_000_000).toFixed(1)}M`
}

/** Copy key naming which kind of change one recorded entry was. */
function activityKindKey(kind: TeamActivityKind): TeamKey {
  switch (kind) {
    case 'member': return 'activityKindMember'
    case 'task': return 'activityKindTask'
    case 'message-queued':
    case 'message-delivered': return 'activityKindMessage'
  }
}

/**
 * Copy key for the state a recorded change reached. The state arrives as the
 * durable phase or status string, so a vocabulary this build does not know
 * renders raw rather than dropping the row.
 */
function activityStateKey(entry: TeamActivityEntry): TeamKey | undefined {
  if (entry.kind === 'message-queued') return 'activityQueued'
  if (entry.kind === 'message-delivered') return 'activityDelivered'
  switch (entry.state) {
    case 'provisioning': return 'phase.provisioning'
    case 'active': return 'phase.active'
    case 'failed': return 'phase.failed'
    case 'pending': return 'status.pending'
    case 'in_progress': return 'status.in_progress'
    case 'completed': return 'status.completed'
    case 'deleted': return 'status.deleted'
    default: return undefined
  }
}

/** Settled changes read as done, a failed teammate as an error, the rest as motion. */
function activityDot(entry: TeamActivityEntry): 'ongoing' | 'done' | 'error' {
  if (entry.state === 'failed') return 'error'
  if (entry.kind === 'message-delivered' || entry.state === 'completed') return 'done'
  return 'ongoing'
}

function formatRecordedTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function memberStatusKey(status: TeamRosterMember['status']): TeamKey {
  switch (status) {
    case 'running': return 'memberStatus.running'
    case 'idle': return 'memberStatus.idle'
    case 'inactive': return 'memberStatus.inactive'
    case 'provisioning': return 'memberStatus.provisioning'
    case 'failed': return 'memberStatus.failed'
  }
}

/** Render the live Team roster and compare-and-set task board. */
export function TeamAction({
  sessionId, load, createTask, updateTask, spawnTeammate, sendMessage, interrupt, waitForChange,
  activity, openTeammate, useColorScheme, toggleTheme, t, standalone = false,
}: TeamSurfaceProps) {
  const colorScheme = useColorScheme(scheme => scheme)
  const [open, setOpen] = useState(standalone)
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<TeamView | null>(null)
  const [history, setHistory] = useState<TeamActivityEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [createDraft, setCreateDraft] = useState<Draft>(EMPTY_DRAFT)
  const [editing, setEditing] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY_DRAFT)
  const [pendingTasks, setPendingTasks] = useState<ReadonlySet<string>>(() => new Set())
  const [confirmingDelete, setConfirmingDelete] = useState<TeamTaskId | null>(null)
  const [activeMemberId, setActiveMemberId] = useState<SessionId | null>(null)
  const [ambientPaused, setAmbientPaused] = useState(false)
  const [spawning, setSpawning] = useState(false)
  const [spawnDraft, setSpawnDraft] = useState<SpawnDraft>(EMPTY_SPAWN)
  const [spawnPending, setSpawnPending] = useState(false)
  const [messaging, setMessaging] = useState<SessionId | null>(null)
  const [messageDraft, setMessageDraft] = useState<MessageDraft>(EMPTY_MESSAGE)
  const [messagePending, setMessagePending] = useState(false)
  const [interruptingMemberId, setInterruptingMemberId] = useState<SessionId | null>(null)
  // Acknowledgement for the two actions whose effect is not otherwise visible
  // on the card: an interrupt that lands between polls, and a queued message.
  const [notice, setNotice] = useState<string | null>(null)
  const reduceMotion = useReducedMotion()
  const sessionRef = useRef(sessionId)
  const refreshGeneration = useRef(0)
  sessionRef.current = sessionId

  useEffect(() => {
    refreshGeneration.current += 1
    setOpen(standalone)
    setLoading(false)
    setView(null)
    setError(null)
    setCreating(false)
    setCreateDraft(EMPTY_DRAFT)
    setEditing(null)
    setEditDraft(EMPTY_DRAFT)
    setPendingTasks(new Set())
    setConfirmingDelete(null)
    setActiveMemberId(null)
    setSpawning(false)
    setSpawnDraft(EMPTY_SPAWN)
    setSpawnPending(false)
    setMessaging(null)
    setMessageDraft(EMPTY_MESSAGE)
    setMessagePending(false)
    setInterruptingMemberId(null)
    setNotice(null)
  }, [sessionId, standalone])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (!standalone && event.key === 'Escape') setOpen(false)
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open, standalone])

  /**
   * Bounded hold for one live update. The host caps the wait between ten
   * seconds and one hour and the wire carries no cancellation, so a short hold
   * keeps an abandoned wait from outliving the surface for long.
   */
  const LIVE_WAIT_MS = 30_000

  const refresh = useCallback(async (): Promise<boolean> => {
    const requestedSession = sessionId
    const generation = ++refreshGeneration.current
    setLoading(true)
    const result = await load(requestedSession)
    if (sessionRef.current !== requestedSession || refreshGeneration.current !== generation) return false
    setLoading(false)
    if (result.ok) {
      setView(result.value)
      setError(null)
      // The history follows the same change signal as the board, so one reload
      // keeps where the Team is and how it got there in step.
      const recorded = await activity(requestedSession, ACTIVITY_LIMIT)
      if (sessionRef.current === requestedSession && recorded.ok) setHistory(recorded.value)
      return true
    } else {
      setError(failureText(result.error))
      return false
    }
  }, [activity, load, sessionId])

  useEffect(() => {
    if (!standalone) return
    void refresh()
  }, [refresh, standalone])

  // Follow the running Team: hold one bounded wait, reload on every observed
  // change, and re-enter the wait. A transport failure ends the loop and leaves
  // the manual refresh as the way back, rather than spinning against a Remote
  // that is not answering.
  useEffect(() => {
    if (!open) return
    const requestedSession = sessionId
    const following = new AbortController()
    // Read through a call: TypeScript keeps a property read narrowed across the
    // await below, and the re-check exists because the surface can close while
    // one wait is outstanding.
    const stopped = (): boolean => following.signal.aborted
    const follow = async (): Promise<void> => {
      while (!stopped()) {
        const waited = await waitForChange(requestedSession, LIVE_WAIT_MS)
        if (stopped() || sessionRef.current !== requestedSession) return
        if (!waited.ok) return
        if (!waited.value.timedOut) await refresh()
      }
    }
    void follow()
    return () => { following.abort() }
  }, [open, refresh, sessionId, waitForChange])

  const submitSpawn = useCallback(async (): Promise<void> => {
    const requestedSession = sessionId
    setSpawnPending(true)
    try {
      const result = await spawnTeammate(requestedSession, {
        name: spawnDraft.name.trim(),
        description: spawnDraft.description.trim(),
        prompt: spawnDraft.prompt.trim(),
        context: spawnDraft.context,
      })
      if (sessionRef.current !== requestedSession) return
      if (!result.ok) {
        setError(failureText(result.error))
        return
      }
      if (!result.value.ok) {
        setError(failureText(result.value.error))
        return
      }
      setError(null)
      setSpawning(false)
      setSpawnDraft(EMPTY_SPAWN)
      await refresh()
    } finally {
      if (sessionRef.current === requestedSession) setSpawnPending(false)
    }
  }, [refresh, sessionId, spawnDraft, spawnTeammate])

  const submitMessage = useCallback(async (targetName: string): Promise<void> => {
    const requestedSession = sessionId
    setMessagePending(true)
    try {
      const result = await sendMessage(requestedSession, {
        target: targetName,
        message: messageDraft.message.trim(),
        delivery: messageDraft.delivery,
      })
      if (sessionRef.current !== requestedSession) return
      if (!result.ok) {
        setError(failureText(result.error))
        return
      }
      if (!result.value.ok) {
        setError(failureText(result.value.error))
        return
      }
      setError(null)
      setNotice(t('messageQueued'))
      setMessaging(null)
      setMessageDraft(EMPTY_MESSAGE)
      await refresh()
    } finally {
      if (sessionRef.current === requestedSession) setMessagePending(false)
    }
  }, [messageDraft, refresh, sendMessage, sessionId, t])

  const stopTeammate = useCallback(async (member: TeamRosterMember): Promise<void> => {
    const requestedSession = sessionId
    setInterruptingMemberId(member.id)
    try {
      const result = await interrupt(requestedSession, member.name)
      if (sessionRef.current !== requestedSession) return
      if (!result.ok) {
        setError(failureText(result.error))
        return
      }
      if (!result.value.ok) {
        setError(failureText(result.value.error))
        return
      }
      setError(null)
      setNotice(t('interrupted'))
      await refresh()
    } finally {
      if (sessionRef.current === requestedSession) setInterruptingMemberId(null)
    }
  }, [interrupt, refresh, sessionId, t])

  const invalidateRefresh = useCallback((): void => {
    refreshGeneration.current += 1
    setLoading(false)
  }, [])

  const settleTask = useCallback(async (
    taskId: string,
    operation: () => Promise<TeamTaskActionResult>,
  ): Promise<TeamTask | undefined> => {
    const requestedSession = sessionId
    invalidateRefresh()
    setPendingTasks(current => new Set(current).add(taskId))
    try {
      const result = await operation()
      if (sessionRef.current !== requestedSession) return undefined
      if (!result.ok) {
        setError(failureText(result.error))
        return undefined
      }
      if (!result.value.ok) {
        if (result.value.error.code === 'team-task-conflict') {
          const reloaded = await refresh()
          if (sessionRef.current !== requestedSession) return undefined
          if (reloaded) setError(t('conflict'))
        } else {
          setError(failureText(result.value.error))
        }
        return undefined
      }
      const task = result.value.value
      setError(null)
      await refresh()
      if (sessionRef.current !== requestedSession) return undefined
      return task
    } finally {
      if (sessionRef.current === requestedSession) {
        setPendingTasks((current) => {
          const next = new Set(current)
          next.delete(taskId)
          return next
        })
      }
    }
  }, [invalidateRefresh, refresh, sessionId, t])

  const submitCreate = async (): Promise<void> => {
    const subject = createDraft.subject.trim()
    const description = createDraft.description.trim()
    /* v8 ignore next -- TaskForm disables Save while either normalized field is empty. */
    if (subject === '' || description === '') return
    const created = await settleTask('create', () => createTask(sessionId, {
      subject,
      description,
      blockedBy: taskIds(createDraft.blockers),
      writeScopes: items(createDraft.scopes),
    }))
    if (created === undefined) return
    setCreateDraft(EMPTY_DRAFT)
    setCreating(false)
  }

  const startEdit = (task: TeamTask): void => {
    setEditing(task.id)
    setEditDraft({
      subject: task.subject,
      description: task.description,
      blockers: task.blockedBy.join(', '),
      scopes: task.writeScopes.join(', '),
    })
  }

  const submitEdit = async (task: TeamTask): Promise<void> => {
    const requestedSession = sessionId
    const edited = await settleTask(task.id, () => updateTask(requestedSession, {
      taskId: task.id,
      expectedRevision: task.revision,
      action: 'edit',
      subject: editDraft.subject.trim(),
      description: editDraft.description.trim(),
      writeScopes: items(editDraft.scopes),
    }))
    if (edited === undefined) return
    const blockedBy = taskIds(editDraft.blockers)
    if (blockedBy.length === edited.blockedBy.length
      && blockedBy.every((blocker, index) => blocker === edited.blockedBy[index])) {
      setEditing(null)
      return
    }
    const dependencyTask = await settleTask(task.id, () => updateTask(requestedSession, {
      taskId: task.id,
      expectedRevision: edited.revision,
      action: 'set_dependencies',
      blockedBy,
    }))
    if (dependencyTask === undefined) return
    setEditing(null)
  }

  const teammates = view?.members.filter(member => member.role === 'teammate') ?? []
  // One addable seat while the Team is under its own capacity, then inert seats
  // only to fill the row out. Padding to a fixed four hid the control the
  // moment a Team grew past it, while the service still had room.
  const roomToAdd = (view?.members.length ?? 0) < (view?.capacity ?? 0)
  const seatCount = Math.max(
    roomToAdd ? 1 : 0,
    Math.max(0, ROSTER_MIN_TILES - (view?.members.length ?? 0)),
  )
  // The board is a dependency graph, not a list: group it into the lanes its
  // own derived readiness already implies, so what is running, what can start,
  // and what is waiting on something else are separable at a glance.
  const laned = LANE_ORDER.flatMap((label) => {
    const lane = (view?.tasks ?? []).filter(task => laneOf(task) === label)
    return lane.map((task, index) => ({
      task,
      laneStart: index === 0 ? { label, count: lane.length } : undefined,
    }))
  })
  // Subjects for the ids a task names as blockers; a raw id says nothing about
  // what is actually in the way.
  const subjectOf = new Map((view?.tasks ?? []).map(task => [String(task.id), task.subject]))
  // Write scopes are advisory rather than locks, so the board is the only place
  // an overlap is visible before two members edit the same paths.
  const scopeOwners = new Map<string, Set<string>>()
  for (const task of view?.tasks ?? []) {
    if (task.status === 'completed') continue
    for (const scope of task.writeScopes) {
      const owners = scopeOwners.get(scope) ?? new Set<string>()
      owners.add(task.ownerName ?? '')
      scopeOwners.set(scope, owners)
    }
  }

  // There is something to delegate once the board carries a task or a member is
  // already running; before that the lead has not done work worth splitting.
  const canDelegate = (view?.tasks.length ?? 0) > 0
    || (view?.members.some(member => member.status === 'running') ?? false)
  const assignable = view?.members.filter(member => member.status !== 'failed' && member.status !== 'provisioning') ?? []
  const revealTransition: Transition = reduceMotion
    ? { duration: 0.01 }
    : { duration: 0.18, ease: [0.23, 1, 0.32, 1] }
  // Content the widening card uncovers follows its geometry on the reveal
  // tier: the CSS `ease` curve over the same 400ms the surface layers use.
  const detailsTransition: Transition = reduceMotion
    ? { duration: 0.01 }
    : { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }

  return (
    <div className={css.root} data-team-action data-team-standalone={standalone || undefined}>
      {!standalone && (
        <button
          type="button"
          className={css.trigger}
          aria-expanded={open}
          onClick={() => {
            const next = !open
            setOpen(next)
            if (next) void refresh()
          }}
        >
          <IconUserOutline16 size={14} />
          <span>{t('trigger')}</span>
          {teammates.length > 0 && <span className={css.count}>{teammates.length}</span>}
        </button>
      )}
      {open && (
        <motion.div
          className={css.panel}
          role={standalone ? 'main' : 'dialog'}
          aria-modal={standalone ? undefined : 'true'}
          aria-label={t('trigger')}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={revealTransition}
        >
          <div
            // The ambient drift costs frames the opening card needs: its
            // blurred fields are blended, not composited, so every drift frame
            // re-blends the whole backdrop under four glass cards. A 24s drift
            // held still for one 600ms open is not visible; the dropped frames
            // during that open are.
            className={ambientPaused || activeMemberId !== null ? `${css.ambient} ${css.ambientPaused}` : css.ambient}
            aria-hidden="true"
          >
            <span className={css.ambientOrange} />
            <span className={css.ambientBlue} />
          </div>
          <header className={css.workspaceHeader}>
            <div className={css.workspaceHeading}>
              <span className={css.eyebrow}>{t('workspaceEyebrow')}</span>
              <h2>{t('workspaceTitle')}</h2>
              <p>{t('workspaceSubtitle')}</p>
            </div>
            <div className={css.sessionBadge}>
              <StateDot state="ongoing" />
              <span>{t('activeSession')}</span>
            </div>
            {(!standalone || !reduceMotion) && (
              <div className={css.toolbar}>
                {standalone
                  ? (
                    <>
                      <button
                        type="button"
                        className={css.iconButton}
                        aria-label={t(colorScheme === 'dark' ? 'toLightTheme' : 'toDarkTheme')}
                        onClick={toggleTheme}
                      >
                        {colorScheme === 'dark' ? <IconLightOutline16 size={14} /> : <IconDarkOutline16 size={14} />}
                      </button>
                      <button
                        type="button"
                        className={css.iconButton}
                        aria-label={t(ambientPaused ? 'resumeMotion' : 'pauseMotion')}
                        aria-pressed={ambientPaused}
                        onClick={() => { setAmbientPaused(value => !value) }}
                      >
                        {ambientPaused ? <IconPlayOutline16 size={14} /> : <IconPauseOutline16 size={14} />}
                      </button>
                    </>
                  )
                  : (
                    <>
                      <button
                        type="button"
                        className={loading ? `${css.iconButton} ${css.refreshing}` : css.iconButton}
                        aria-label={t(loading ? 'loading' : 'refresh')}
                        aria-busy={loading || undefined}
                        onClick={() => { void refresh() }}
                      >
                        <IconRefreshOutline14 />
                      </button>
                      <button type="button" className={css.iconButton} aria-label={t('close')} onClick={() => { setOpen(false) }}>
                        <IconCloseOutline16 size={14} />
                      </button>
                    </>
                  )}
              </div>
            )}
          </header>
          <div className={css.workspaceBody}>
            {error !== null && <div className={css.error} role="alert">{error}</div>}
            {error === null && notice !== null && (
              <div className={css.notice} role="status">{notice}</div>
            )}
            {loading && view === null && (
              <div className={css.loading}><Loader variant="dots" text={t('loading')} /></div>
            )}
            {view !== null && (
              <>
                <section className={css.rosterSection} aria-labelledby="agent-team-roster-heading">
                  <div className={css.sectionIntro}>
                    <span className={css.sectionRule} />
                    <h3 id="agent-team-roster-heading">{t('roster')}</h3>
                    <span className={css.sectionRule} />
                  </div>
                  <div
                    className={css.roster}
                    role="list"
                    onPointerLeave={(event) => {
                      if (event.pointerType === 'mouse') setActiveMemberId(null)
                    }}
                  >
                    {view.members.map((member, index) => {
                      const active = member.id === activeMemberId
                      const assigned = view.tasks.filter(task => task.ownerName === member.name)
                      // Write scopes are advisory rather than locks, so an
                      // overlap is the one thing a member can silently do to
                      // another's work. Surface it on the roster, not only
                      // inside the task it belongs to.
                      const overlapping = assigned.some(task => task.writeScopeWarnings.length > 0)
                      const canOpen = member.role === 'teammate'
                          && member.status !== 'failed'
                          && member.status !== 'provisioning'
                      const accessibleLabel = [
                        member.name,
                        t(memberStatusKey(member.status)),
                        member.model === undefined ? '' : `${t('model')}: ${member.model}`,
                        ...member.diagnostics,
                      ].join('')
                      return (
                        <div
                          key={member.id}
                          role="listitem"
                          data-team-member-card={member.id}
                          data-expanded={active ? 'true' : 'false'}
                          className={active ? `${css.memberCard} ${css.memberCardActive}` : css.memberCard}
                          onPointerEnter={(event) => {
                            if (event.pointerType === 'mouse') setActiveMemberId(member.id)
                          }}
                          onFocusCapture={() => { setActiveMemberId(member.id) }}
                          onBlurCapture={(event) => {
                            if (!event.currentTarget.contains(event.relatedTarget)) setActiveMemberId(null)
                          }}
                        >
                          {member.role === 'teammate' && canOpen && messaging !== member.id && (
                            <button
                              type="button"
                              className={css.messageButton}
                              aria-label={t('message')}
                              title={t('message')}
                              onClick={() => { setMessaging(member.id); setMessageDraft(EMPTY_MESSAGE) }}
                            >
                              <IconNewChatOutline16 size={13} />
                            </button>
                          )}
                          {member.role === 'teammate' && member.status === 'running' && (
                            <button
                              type="button"
                              className={css.interruptButton}
                              aria-label={t(interruptingMemberId === member.id ? 'interrupting' : 'interrupt')}
                              title={t('interrupt')}
                              aria-busy={interruptingMemberId === member.id || undefined}
                              disabled={interruptingMemberId === member.id}
                              onClick={() => { void stopTeammate(member) }}
                            >
                              <IconCloseOutline16 size={13} />
                            </button>
                          )}
                          {messaging === member.id && (
                            <MessageForm
                              draft={messageDraft}
                              setDraft={setMessageDraft}
                              pending={messagePending}
                              onSend={() => { void submitMessage(member.name) }}
                              onCancel={() => { setMessaging(null); setMessageDraft(EMPTY_MESSAGE) }}
                              t={t}
                            />
                          )}
                          {messaging !== member.id && (
                            <button
                              type="button"
                              className={css.memberButton}
                              aria-label={accessibleLabel}
                              disabled={!canOpen}
                              title={canOpen ? t('open') : undefined}
                              onClick={() => {
                                void openTeammate(sessionId, member).catch((reason: unknown) => { setError(String(reason)) })
                              }}
                            >
                              <span className={css.memberTopline}>
                                <span className={css.roleLabel}>{t(member.role === 'lead' ? 'leadRole' : 'teammateRole')}</span>
                                <span className={css.memberState}>
                                  <StateDot state={member.status === 'running' ? 'ongoing' : member.status === 'failed' ? 'error' : 'done'} />
                                  {member.status === 'provisioning'
                                    ? <TextShimmer duration={2.4} spread={12}>{t(memberStatusKey(member.status))}</TextShimmer>
                                    : t(memberStatusKey(member.status))}
                                </span>
                              </span>
                              <span className={`${css.memberGlyph} ${css[`memberGlyph${String(index % 4)}`]}`} aria-hidden="true">
                                <IconUserOutline16 size={44} />
                              </span>
                              <span className={css.memberText}>
                                <strong>{member.name}</strong>
                                {member.model !== undefined && <small>{t('model')}: {member.model}</small>}
                                {member.diagnostics.map(diagnostic => (
                                  <small key={diagnostic} className={css.diagnostic}>{diagnostic}</small>
                                ))}
                              </span>
                              <AnimatePresence initial={false}>
                                {active && (
                                  <motion.span
                                    className={css.memberDetails}
                                    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(10px)' }}
                                    animate={{ opacity: 1, transform: 'translateY(0)' }}
                                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translateY(10px)' }}
                                    transition={detailsTransition}
                                  >
                                    {overlapping && (
                                      <span className={css.scopeWarning}>
                                        <StateDot state="error" />
                                        {t('scopeOverlap')}
                                      </span>
                                    )}
                                    <span className={css.detailLabel}>{t('assignedTasks')}</span>
                                    <span className={css.detailValue}>
                                      {assigned.length === 0 ? t('noAssignedTasks') : assigned.map(task => task.subject).join(' · ')}
                                    </span>
                                    {member.effort !== undefined && (
                                      <MemberEffort effort={member.effort} t={t} />
                                    )}
                                  </motion.span>
                                )}
                              </AnimatePresence>
                              <span className={css.cardIndex}>{String(index + 1).padStart(2, '0')}</span>
                            </button>
                          )}
                        </div>
                      )
                    })}
                    {Array.from({ length: seatCount }, (_, index) => {
                      // Only the first free seat takes a new teammate; the rest
                      // stay inert so the row still reads as remaining capacity.
                      // Delegation is offered once there is work to delegate, so
                      // the most prominent live control on a fresh workspace is
                      // not the one that spawns a permanent teammate.
                      const addable = index === 0 && canDelegate
                      const locked = index === 0 && !canDelegate
                      return (
                        <div key={`open-seat-${String(index)}`} role="listitem" className={`${css.memberCard} ${css.openSeat}`}>
                          {addable && spawning && (
                            <SpawnForm
                              draft={spawnDraft}
                              setDraft={setSpawnDraft}
                              pending={spawnPending}
                              onSave={() => { void submitSpawn() }}
                              onCancel={() => { setSpawning(false); setSpawnDraft(EMPTY_SPAWN) }}
                              t={t}
                            />
                          )}
                          {addable && !spawning && (
                            <button
                              type="button"
                              className={css.openSeatAdd}
                              data-team-add-teammate
                              onClick={() => { setSpawning(true) }}
                            >
                              <span className={css.openSeatMark} aria-hidden="true"><IconPlusOutline16 size={24} /></span>
                              <span>{t('addTeammate')}</span>
                            </button>
                          )}
                          {!addable && (
                            <span className={css.openSeatBody}>
                              <span className={css.openSeatMark} aria-hidden="true"><IconPlusOutline16 size={24} /></span>
                              <span>{locked ? t('seatLocked') : t('openSeat')}</span>
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </section>
                <section className={css.taskDock} aria-labelledby="agent-team-tasks-heading">
                  <div className={css.sectionTitle}>
                    <div>
                      <span className={css.eyebrow}>{t('liveState')}</span>
                      <h3 id="agent-team-tasks-heading">{t('tasks')}</h3>
                    </div>
                    <button type="button" className={css.smallButton} onClick={() => { setCreating(true) }}>
                      <IconPlusOutline16 size={13} /> {t('create')}
                    </button>
                  </div>
                  {creating && (
                    <TaskForm
                      draft={createDraft}
                      setDraft={setCreateDraft}
                      pending={pendingTasks.has('create')}
                      onSave={() => { void submitCreate() }}
                      onCancel={() => { setCreating(false) }}
                      t={t}
                    />
                  )}
                  {view.tasks.length === 0 && !creating && <div className={css.notice}>{t('empty')}</div>}
                  <div className={css.tasks}>
                    {laned.map(({ task, laneStart }) => (
                      <Fragment key={task.id}>
                        {laneStart !== undefined && (
                          <h4 className={css.laneHeading}>
                            {t(laneStart.label)}<span>{laneStart.count}</span>
                          </h4>
                        )}
                        {editing === task.id
                          ? (
                            <TaskForm
                              key={task.id}
                              draft={editDraft}
                              setDraft={setEditDraft}
                              pending={pendingTasks.has(task.id)}
                              onSave={() => { void submitEdit(task) }}
                              onCancel={() => { setEditing(null) }}
                              t={t}
                            />
                          )
                          : (
                            <article
                              key={task.id}
                              className={pendingTasks.has(task.id) ? `${css.task} ${css.taskPending}` : css.task}
                              aria-busy={pendingTasks.has(task.id) || undefined}
                            >
                              <div className={css.taskTitle}>
                                <strong>{task.subject}</strong>
                                <span>
                                  {pendingTasks.has(task.id)
                                    ? <TextShimmer duration={1.8} spread={10}>{t('updatingTask')}</TextShimmer>
                                    : t(statusKey(task.status))}
                                </span>
                              </div>
                              <p>{task.description}</p>
                              <div className={css.meta}>
                                <span>{task.id}</span>
                                {task.blockedBy.length > 0 && (
                                  <span>
                                    {t('blockedBy')}: {task.blockedBy.map(id => subjectOf.get(String(id)) ?? String(id)).join(', ')}
                                  </span>
                                )}
                                {task.writeScopes.length > 0 && <span>{t('writeScopes')}: {task.writeScopes.join(', ')}</span>}
                                {task.writeScopeWarnings.map(warning => <span key={warning} className={css.warning}>{warning}</span>)}
                              </div>
                              <div className={css.taskActions}>
                                <label>
                                  {t('owner')}
                                  <select
                                    value={task.ownerName ?? ''}
                                    disabled={pendingTasks.has(task.id) || task.status === 'completed' || confirmingDelete === task.id}
                                    onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                                      const owner = event.target.value
                                      void settleTask(task.id, () => updateTask(sessionId, {
                                        taskId: task.id,
                                        expectedRevision: task.revision,
                                        action: 'reassign',
                                        ...owner === '' ? {} : { owner },
                                      }))
                                    }}
                                  >
                                    <option value="">{t('unowned')}</option>
                                    {assignable.map(member => <option key={member.id} value={member.name}>{member.name}</option>)}
                                  </select>
                                </label>
                                <button
                                  type="button"
                                  onClick={() => { startEdit(task) }}
                                  disabled={pendingTasks.has(task.id) || confirmingDelete === task.id}
                                >
                                  <IconEditOutline16 size={13} /> {t('edit')}
                                </button>
                                {task.status === 'in_progress' && (
                                  <button type="button" disabled={pendingTasks.has(task.id) || confirmingDelete === task.id} onClick={() => {
                                    void settleTask(task.id, () => updateTask(sessionId, {
                                      taskId: task.id, expectedRevision: task.revision, action: 'complete',
                                    }))
                                  }}><IconCheckOutline14 /> {t('complete')}</button>
                                )}
                                {task.status === 'completed' && (
                                  <button type="button" disabled={pendingTasks.has(task.id) || confirmingDelete === task.id} onClick={() => {
                                    void settleTask(task.id, () => updateTask(sessionId, {
                                      taskId: task.id, expectedRevision: task.revision, action: 'reopen',
                                    }))
                                  }}>{t('reopen')}</button>
                                )}
                                {confirmingDelete === task.id
                                  ? (
                                    <span className={css.deleteConfirm} role="group" aria-label={`${t('deleteConfirm')}: ${task.subject}`}>
                                      <span>{t('deleteConfirm')}: <strong>{task.subject}</strong></span>
                                      <button type="button" className={css.dangerButton} disabled={pendingTasks.has(task.id)} onClick={() => {
                                        void settleTask(task.id, () => updateTask(sessionId, {
                                          taskId: task.id, expectedRevision: task.revision, action: 'delete',
                                        })).then((deleted) => { if (deleted !== undefined) setConfirmingDelete(null) })
                                      }}><IconTrashOutline16 size={13} /> {t('delete')}</button>
                                      <button type="button" disabled={pendingTasks.has(task.id)} onClick={() => { setConfirmingDelete(null) }}>
                                        {t('cancel')}
                                      </button>
                                    </span>
                                  )
                                  : (
                                    <button type="button" disabled={pendingTasks.has(task.id)} onClick={() => { setConfirmingDelete(task.id) }}>
                                      <IconTrashOutline16 size={13} /> {t('delete')}
                                    </button>
                                  )}
                              </div>
                            </article>
                          )}
                      </Fragment>
                    ))}
                  </div>
                  {scopeOwners.size > 0 && (
                    <div className={css.scopeMap}>
                      <span className={css.detailLabel}>{t('scopeMap')}</span>
                      {[...scopeOwners.entries()].map(([scope, owners]) => {
                        const named = [...owners].filter(owner => owner !== '')
                        const shared = named.length > 1
                        return (
                          <span key={scope} className={shared ? `${css.scopeRow} ${css.warning}` : css.scopeRow}>
                            <code>{scope}</code>
                            <span>{named.length === 0 ? t('scopeUnowned') : named.join(', ')}</span>
                            {shared && <span>{t('scopeShared')}</span>}
                          </span>
                        )
                      })}
                    </div>
                  )}
                </section>
                <section className={css.activityDock} aria-labelledby="agent-team-activity-heading">
                  <div className={css.sectionTitle}>
                    <div>
                      <span className={css.eyebrow}>{t('activityEyebrow')}</span>
                      <h3 id="agent-team-activity-heading">{t('activityTitle')}</h3>
                    </div>
                  </div>
                  {history.length === 0 && <div className={css.notice}>{t('activityEmpty')}</div>}
                  {history.length > 0 && (
                    <ol className={css.activity} data-team-activity>
                      {history.map((entry) => {
                        const stateKey = activityStateKey(entry)
                        return (
                          <li key={entry.seq} className={css.activityRow}>
                            <time className={css.activityTime} dateTime={new Date(entry.time).toISOString()}>
                              {formatRecordedTime(entry.time)}
                            </time>
                            <StateDot state={activityDot(entry)} />
                            <span className={css.activityKind}>{t(activityKindKey(entry.kind))}</span>
                            <span className={css.activitySubject}>
                              {entry.target === undefined ? entry.subject : `${entry.subject} → ${entry.target}`}
                            </span>
                            <span className={css.activityState}>
                              {stateKey === undefined ? entry.state : t(stateKey)}
                            </span>
                          </li>
                        )
                      })}
                    </ol>
                  )}
                </section>
                <footer className={css.workspaceFooter}>
                  <span><StateDot state="ongoing" /> {t('liveState')}</span>
                  <span>{view.members.length} {t('membersMetric')}</span>
                  <span>{view.tasks.length} {t('tasksMetric')}</span>
                </footer>
              </>
            )}
          </div>
        </motion.div>
      )}
    </div>
  )
}

interface MemberEffortProps {
  effort: TeamMemberEffort
  t: TeamSurfaceProps['t']
}

/**
 * What one member has spent. Cached input is named only when the provider
 * served some: a zero there is not the same fact as "no cache", and a roster
 * tile that always shows it teaches nothing.
 */
function MemberEffort({ effort, t }: MemberEffortProps) {
  return (
    <>
      <span className={css.detailLabel}>{t('effortLabel')}</span>
      <span className={css.detailValue} data-team-effort>
        {t('effortTurns', { turns: effort.turns })}
        {' · '}
        {t('effortTime', {
          model: formatDuration(effort.modelMs, t),
          tool: formatDuration(effort.toolMs, t),
        })}
        {' · '}
        {t('effortTokens', {
          input: formatTokens(effort.inputTokens),
          output: formatTokens(effort.outputTokens),
        })}
        {effort.cacheReadTokens > 0 && ` · ${t('effortCached', { cached: formatTokens(effort.cacheReadTokens) })}`}
      </span>
    </>
  )
}

interface TaskFormProps {
  draft: Draft
  setDraft: (draft: Draft) => void
  pending: boolean
  onSave: () => void
  onCancel: () => void
  t: TeamActionProps['t']
}

interface MessageFormProps {
  draft: MessageDraft
  setDraft: (draft: MessageDraft) => void
  pending: boolean
  onSend: () => void
  onCancel: () => void
  t: TeamSurfaceProps['t']
}

/** In-card composer for one durable peer message to this teammate. */
function MessageForm({ draft, setDraft, pending, onSend, onCancel, t }: MessageFormProps) {
  return (
    <div className={`${css.form} ${css.spawnForm}`} aria-busy={pending || undefined}>
      <textarea
        value={draft.message}
        placeholder={t('messageText')}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => { setDraft({ ...draft, message: event.target.value }) }}
      />
      <select
        value={draft.delivery}
        aria-label={t('messageText')}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => {
          setDraft({ ...draft, delivery: event.target.value === 'wakeup' ? 'wakeup' : 'quiet' })
        }}
      >
        <option value="quiet">{t('messageQuiet')}</option>
        <option value="wakeup">{t('messageWakeup')}</option>
      </select>
      <div className={css.formActions}>
        <button type="button" disabled={pending || draft.message.trim() === ''} onClick={onSend}>
          {t(pending ? 'sending' : 'send')}
        </button>
        <button type="button" disabled={pending} onClick={onCancel}>{t('cancel')}</button>
      </div>
    </div>
  )
}

interface SpawnFormProps {
  draft: SpawnDraft
  setDraft: (draft: SpawnDraft) => void
  pending: boolean
  onSave: () => void
  onCancel: () => void
  t: TeamSurfaceProps['t']
}

/** Open-seat form that turns remaining capacity into one durable teammate. */
function SpawnForm({ draft, setDraft, pending, onSave, onCancel, t }: SpawnFormProps) {
  const incomplete = draft.name.trim() === '' || draft.description.trim() === '' || draft.prompt.trim() === ''
  return (
    <div className={`${css.form} ${css.spawnForm}`}>
      <input
        value={draft.name}
        placeholder={t('teammateName')}
        onChange={(event: ChangeEvent<HTMLInputElement>) => { setDraft({ ...draft, name: event.target.value }) }}
      />
      <input
        value={draft.description}
        placeholder={t('teammateDescription')}
        onChange={(event: ChangeEvent<HTMLInputElement>) => { setDraft({ ...draft, description: event.target.value }) }}
      />
      <textarea
        value={draft.prompt}
        placeholder={t('teammatePrompt')}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => { setDraft({ ...draft, prompt: event.target.value }) }}
      />
      <select
        value={draft.context}
        aria-label={t('teammatePrompt')}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => {
          setDraft({ ...draft, context: event.target.value === 'fork' ? 'fork' : 'fresh' })
        }}
      >
        <option value="fresh">{t('contextFresh')}</option>
        <option value="fork">{t('contextFork')}</option>
      </select>
      <p className={css.spawnHint}>{t('spawnPermanent')}</p>
      <div className={css.formActions}>
        {pending
          ? <Loader variant="typing" text={t('spawning')} />
          : <button type="button" disabled={incomplete} onClick={onSave}>{t('spawn')}</button>}
        <button type="button" disabled={pending} onClick={onCancel}>{t('cancel')}</button>
      </div>
    </div>
  )
}

function TaskForm({ draft, setDraft, pending, onSave, onCancel, t }: TaskFormProps) {
  const field = (key: keyof Draft, value: string): void => { setDraft({ ...draft, [key]: value }) }
  return (
    <div className={css.form} aria-busy={pending || undefined}>
      <input value={draft.subject} placeholder={t('subject')} onChange={(event: ChangeEvent<HTMLInputElement>) => { field('subject', event.target.value) }} />
      <textarea value={draft.description} placeholder={t('description')} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => { field('description', event.target.value) }} />
      <input value={draft.blockers} placeholder={t('blockers')} onChange={(event: ChangeEvent<HTMLInputElement>) => { field('blockers', event.target.value) }} />
      <input value={draft.scopes} placeholder={t('scopes')} onChange={(event: ChangeEvent<HTMLInputElement>) => { field('scopes', event.target.value) }} />
      <div className={css.formActions}>
        <button type="button" disabled={pending || draft.subject.trim() === '' || draft.description.trim() === ''} onClick={onSave}>
          {t(pending ? 'savingTask' : 'save')}
        </button>
        <button type="button" disabled={pending} onClick={onCancel}>{t('cancel')}</button>
      </div>
    </div>
  )
}
