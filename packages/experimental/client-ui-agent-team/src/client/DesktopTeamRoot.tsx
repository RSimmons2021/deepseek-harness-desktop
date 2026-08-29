/** Desktop-owned root that enters the designed Team workspace directly. */

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { IconPlusOutline16, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import { TeamAction, type TeamActionInjected } from './TeamAction.tsx'
import { TextShimmer } from './TextShimmer.tsx'
import { NS } from './locales.ts'
import css from './TeamAction.module.css'

/** Desktop session lifecycle injected by the browser plugin. */
export interface DesktopTeamRootInjected extends TeamActionInjected {
  ensureSession: () => Promise<void>
}

/** The root surface receives global Session selectors from ui-session. */
export type DesktopTeamRootProps =
  PropsRuntime<'desktop.root'> & DesktopTeamRootInjected & PropsLocale<typeof NS>

/** Enter an existing Session, or create one before mounting the live Team view. */
export function DesktopTeamRoot({ ensureSession, ...props }: DesktopTeamRootProps) {
  const current = props.useSessions(snapshot => snapshot.current)
  const phase = props.useSessions(snapshot => snapshot.phase)
  const attempted = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const reduceMotion = useReducedMotion()

  const connect = useCallback((): void => {
    attempted.current = true
    setError(null)
    void ensureSession().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason))
    })
  }, [ensureSession])

  useEffect(() => {
    if (current !== undefined || phase !== 'ready' || attempted.current) return
    connect()
  }, [connect, current, phase])

  if (current !== undefined) {
    return <TeamAction {...props} sessionId={current} standalone />
  }

  return (
    <main className={css.panel} aria-label={props.t('trigger')} data-team-desktop-root>
      <div className={`${css.ambient} ${css.ambientPaused}`} aria-hidden="true">
        <span className={css.ambientOrange} />
        <span className={css.ambientBlue} />
      </div>
      <header className={css.workspaceHeader}>
        <div className={css.workspaceHeading}>
          <span className={css.eyebrow}>{props.t('workspaceEyebrow')}</span>
          <h2>{props.t('workspaceTitle')}</h2>
          <p>{props.t('workspaceSubtitle')}</p>
        </div>
        <div className={css.sessionBadge}>
          <StateDot state="ongoing" />
          <TextShimmer duration={2.4} spread={10}>{props.t('preparingSession')}</TextShimmer>
        </div>
      </header>
      <div className={css.workspaceBody}>
        {error !== null && (
          <div className={css.error} role="alert">
            {error}
            <button type="button" className={css.retryButton} onClick={connect}>
              {props.t('retry')}
            </button>
          </div>
        )}
        <section className={css.rosterSection} aria-labelledby="desktop-team-roster-heading">
          <div className={css.sectionIntro}>
            <span className={css.sectionRule} />
            <h3 id="desktop-team-roster-heading">{props.t('roster')}</h3>
            <span className={css.sectionRule} />
          </div>
          <div className={css.roster} role="list" aria-busy="true">
            {Array.from({ length: 4 }, (_, index) => (
              <motion.div
                key={index}
                role="listitem"
                className={`${css.memberCard} ${css.openSeat}`}
                initial={reduceMotion ? false : { opacity: 0, transform: 'translateY(14px)' }}
                animate={{ opacity: 1, transform: 'translateY(0)' }}
                transition={{ duration: 0.36, delay: reduceMotion ? 0 : index * 0.055 }}
              >
                <span className={css.openSeatBody}>
                  <span className={css.roleLabel}>{index === 0 ? props.t('leadRole') : props.t('teammateRole')}</span>
                  <span className={css.openSeatMark} aria-hidden="true"><IconPlusOutline16 size={24} /></span>
                  {index === 0
                    ? <TextShimmer duration={2.6} spread={10}>{props.t('preparingLead')}</TextShimmer>
                    : <span>{props.t('openSeat')}</span>}
                </span>
              </motion.div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
