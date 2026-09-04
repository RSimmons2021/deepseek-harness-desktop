/**
 * The lead's task-spawned children, drawn as a branch under the roster.
 *
 * Teammates are Team members and own a roster card; the children a turn spawns
 * through the task tool are not members, so before this the workspace showed no
 * sign of them at all — the count lived only in the conversation header. The
 * branch is the hero's answer: a stem off the lead card, a rail, and one node
 * per child that pulses while it runs and settles when it stops.
 *
 * Pure component: the catalog and the open action arrive as props.
 */
import { motion, useReducedMotion } from 'motion/react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { TeamKey } from './locales.ts'
import css from './SubagentBranch.module.css'

/*
 * The branch renders whatever the catalog holds, so its element type is read
 * off that catalog rather than imported from the subagent package: the hero
 * depends on the session list it already reads, not on the tool that fills it.
 */
export type SubagentEntry = SessionListState['subagentsByParent'][SessionId]['entries'][number]

/*
 * Only `child` rows are agents. A `diagnostic` row names a candidate the
 * catalog could not read — real, but not something to draw a node for, because
 * a node claims a running or settled agent and this row claims neither.
 */
type ChildEntry = Extract<SubagentEntry, { kind: 'child' }>

/** Stagger ceiling: past this many nodes the last one arrives too late to read as one gesture. */
const STAGGER_CAP = 6
/** Seconds between two neighbouring nodes arriving. */
const STAGGER_STEP = 0.045

/** Props of the lead's subagent branch. */
export interface SubagentBranchProps {
  /** Direct children of the lead Session, in catalog order. */
  entries: readonly SubagentEntry[]
  /** Roster cells the branch aligns against; the stem sits under cell zero. */
  columns: number
  /** Open one child in the conversation column. */
  onOpen: (childSessionId: SessionId, mode: 'one-shot' | 'continuable') => void
  /** Locale reader for this package's namespace. */
  t: (key: TeamKey, params?: Record<string, string | number>) => string
}

/** One child's display label: its creation label, else a short id. */
function labelOf(entry: ChildEntry, t: SubagentBranchProps['t']): string {
  if (entry.mode === 'one-shot' && entry.label !== undefined && entry.label !== '') return entry.label
  return t('subagentUnnamed')
}

/**
 * Render the branch, or nothing when the lead has no children.
 * @param props - catalog entries, roster alignment, and the open action.
 * @returns the branch element, or null while there is nothing to show.
 */
export function SubagentBranch({ entries, columns, onOpen, t }: SubagentBranchProps) {
  const reduceMotion = useReducedMotion()
  const children = entries.filter((entry): entry is ChildEntry => entry.kind === 'child')
  if (children.length === 0) return null

  const running = children.filter(entry => entry.activity === 'running').length
  const countKey: TeamKey = running > 0 ? 'subagentsRunning' : 'subagentsSettled'

  return (
    <section
      className={css.branch}
      style={{ '--branch-columns': String(columns) } as React.CSSProperties}
      aria-label={t(countKey, { count: running > 0 ? running : children.length })}
      data-team-subagent-branch={String(children.length)}
    >
      <motion.span
        className={css.stem}
        aria-hidden="true"
        initial={reduceMotion ? false : { transform: 'scaleY(0)' }}
        animate={{ transform: 'scaleY(1)' }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      />
      <motion.span
        className={css.rail}
        aria-hidden="true"
        initial={reduceMotion ? false : { transform: 'scaleX(0)' }}
        animate={{ transform: 'scaleX(1)' }}
        transition={{ duration: 0.34, delay: reduceMotion ? 0 : 0.16, ease: [0.16, 1, 0.3, 1] }}
      />
      <div className={css.nodes} role="list">
        {children.map((entry, index) => {
          const label = labelOf(entry, t)
          const openable = entry.mode === 'continuable' || entry.activity === 'inactive'
          return (
            <motion.button
              key={entry.id}
              type="button"
              role="listitem"
              className={css.node}
              data-activity={entry.activity}
              data-deeper={entry.hasChildren ? 'true' : 'false'}
              disabled={!openable}
              aria-label={`${label}${t(entry.activity === 'running' ? 'subagentRunning' : 'subagentSettled')}`}
              onClick={() => { onOpen(entry.id, entry.mode) }}
              initial={reduceMotion ? false : { opacity: 0, transform: 'translateY(10px)' }}
              animate={{ opacity: 1, transform: 'translateY(0)' }}
              transition={{
                duration: 0.32,
                delay: reduceMotion ? 0 : Math.min(index, STAGGER_CAP) * STAGGER_STEP,
              }}
            >
              <span className={css.dot} aria-hidden="true">{index + 1}</span>
              <span className={css.label}>{label}</span>
            </motion.button>
          )
        })}
      </div>
    </section>
  )
}
