import { type Ref } from 'react';
import { Link } from 'react-router-dom';
import {
  formatCount,
  formatSessionDate,
  formatXp,
  sessionChallengeBonus,
  sessionGearBonus,
  sessionXp,
} from '../../lib/format.ts';
import { type SessionDetail } from '../../lib/history/history-rules.ts';
import { sessionTimingParts } from '../../lib/workout/session-timing-rules.ts';

interface SessionHeaderProps {
  session: SessionDetail;
  programLabel: string | null;
  backTo: string;
  headingRef: Ref<HTMLHeadingElement>;
}

export function SessionHeader({ session, programLabel, backTo, headingRef }: SessionHeaderProps) {
  const timingText = sessionTimingParts(session).join(' · ');
  const gearBonus = session.historyOnly ? 0 : sessionGearBonus(session.summary);
  const challengeBonus = session.historyOnly ? 0 : sessionChallengeBonus(session.summary);
  return (
    <>
      <Link className="back-link" to={backTo}>
        ‹ History
      </Link>
      <header className="workout-header">
        <div className="stack" style={{ gap: 'var(--space-1)' }}>
          <span className="muted">{programLabel ?? 'Workout'}</span>
          <h1 className="title" ref={headingRef} tabIndex={-1}>
            {formatSessionDate(session.localDate)}
          </h1>
          {timingText && <span className="muted tiny">{timingText}</span>}
        </div>
        <div className="live-xp">
          <output aria-label="Workout XP">
            {session.historyOnly ? 'No XP' : `+${formatXp(sessionXp(session.summary))} XP`}
          </output>
          {challengeBonus > 0 && (
            <span className="muted tiny">includes Challenge bonus +{formatXp(challengeBonus)} XP</span>
          )}
          {gearBonus > 0 && <span className="muted tiny">includes Gear bonus +{formatXp(gearBonus)} XP</span>}
          <span className="muted tiny">{formatCount(session.setCount, 'set')}</span>
        </div>
      </header>
      {session.historyOnly && (
        <p className="notice" role="status">
          Saved to history, no XP
        </p>
      )}
    </>
  );
}
