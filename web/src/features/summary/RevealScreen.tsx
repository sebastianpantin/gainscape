import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { levelProgress } from '@domain/index.ts';
import { type RefObject, useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CountUp } from '../../components/CountUp.tsx';
import { LevelUpIcon, SkillIcon, TrophyIcon } from '../../components/PixelArt.tsx';
import type { Skill } from '../../lib/exercises/catalog-rules.ts';
import {
  celebrate,
  LEVEL_UP_CELEBRATIONS,
  type LevelUpTier,
  primeCelebrationAudio,
} from '../../lib/platform/celebration-effects.ts';
import { prefersReducedMotion } from '../../lib/platform/device-effects.ts';
import { formatXp, sessionXp } from '../../lib/format.ts';
import { usePreferences } from '../../lib/profile/preferences.ts';
import { sessionTimingParts } from '../../lib/workout/session-timing-rules.ts';
import { type CacheFirstLoad } from '../../offline/cache-first.ts';
import { markInstallCardDue } from '../../pwa/install.ts';
import {
  exerciseListQuery,
  finishLootQuery,
  itemCatalogQuery,
  questsQuery,
  skillsQuery,
  standingQuery,
} from '../../lib/query/queries.ts';
import { finishOutcomeOf, type FinishSummary, recallFinishOutcome } from '../../offline/finish-outcome.ts';
import {
  bonusText,
  challengeFailReason,
  challengeHeadline,
  challengeNotAppliedText,
  type LevelUpTakeover as LevelUpTakeoverContent,
  levelUpCueDelayMs,
  levelUpTakeover,
  playsReveal,
  type QuestReveal,
  questRevealLines,
  type RevealTimeline,
  revealShape,
  type RevealTakeover,
  revealTimeline,
  skipsRevealOnKey,
  takeoverKicker,
  unappliedChangesText,
  gainBarLabel,
  xpToNextLevelText,
} from './reveal-rules.ts';
import { describeRecord } from '../../lib/workout/record-text-rules.ts';
import { type LoadedItems, LootPanel } from './LootPanel.tsx';

const TOTAL_COUNT_UP_MS = 900;
const INTERACTIVE_ELEMENTS = 'a[href], button, input, select, textarea, summary, [role="button"], [role="link"]';

const NO_SKILLS: readonly Skill[] = [];

function loadedAfterMount<Loaded>(query: UseQueryResult<CacheFirstLoad<Loaded>>): Loaded | null {
  return query.isFetchedAfterMount && query.isSuccess ? query.data.loaded : null;
}

type RevealPhase = 'playing' | 'settled' | 'skipped';

function useRevealPlayback(
  userId: string,
  timeline: RevealTimeline,
  cueTier: LevelUpTier | null,
  focusAfterSkip: RefObject<HTMLElement | null>,
  plays: boolean,
): { phase: RevealPhase; skip: () => void } {
  const [reducedMotion] = useState(prefersReducedMotion);
  const [phase, setPhase] = useState<RevealPhase>(reducedMotion ? 'settled' : 'playing');
  const skipped = useRef(false);
  const cueDelayMs = levelUpCueDelayMs(timeline, reducedMotion);
  const { settledAfterMs } = timeline;

  useEffect(() => {
    if (cueDelayMs === null || cueTier === null) return;
    primeCelebrationAudio(userId);
    const cue = setTimeout(() => {
      if (!skipped.current) celebrate(userId, LEVEL_UP_CELEBRATIONS[cueTier]);
    }, cueDelayMs);
    return () => clearTimeout(cue);
  }, [cueDelayMs, cueTier, userId]);

  const skip = useCallback(() => {
    skipped.current = true;
    if (document.activeElement?.matches('.reveal-skip')) focusAfterSkip.current?.focus();
    setPhase('skipped');
  }, [focusAfterSkip]);

  useEffect(() => {
    if (!plays || phase !== 'playing') return;
    const settle = setTimeout(() => setPhase('settled'), settledAfterMs);
    const skipOnKey = (event: KeyboardEvent) => {
      const onInteractiveElement =
        event.target instanceof Element && event.target.closest(INTERACTIVE_ELEMENTS) !== null;
      if (skipsRevealOnKey({ key: event.key, onInteractiveElement })) skip();
    };
    document.addEventListener('click', skip);
    document.addEventListener('keydown', skipOnKey);
    return () => {
      clearTimeout(settle);
      document.removeEventListener('click', skip);
      document.removeEventListener('keydown', skipOnKey);
    };
  }, [plays, phase, settledAfterMs, skip]);

  return { phase, skip };
}

function percent(fraction: number): string {
  return `${(Math.min(1, Math.max(0, fraction)) * 100).toFixed(1)}%`;
}

interface GainBarProps {
  skillName: string;
  xpAfter: number;
  gain: number;
  delaySeconds: number;
}

function GainBar({ skillName, xpAfter, gain, delaySeconds }: GainBarProps) {
  const after = levelProgress(xpAfter);
  const before = levelProgress(Math.max(0, xpAfter - gain));
  const startFraction = before.level === after.level ? before.fractionToNextLevel : 0;
  const endFraction = after.fractionToNextLevel;
  return (
    <>
      <div className="meter" role="img" aria-label={gainBarLabel(skillName, xpAfter)}>
        <div className="gain-before" style={{ width: percent(startFraction) }} />
        <div
          className="gain-added"
          style={{
            left: percent(startFraction),
            width: percent(endFraction - startFraction),
            animationDelay: `${delaySeconds}s`,
          }}
        />
      </div>
      <span className="muted tiny" aria-hidden="true">
        {xpToNextLevelText(xpAfter)}
      </span>
    </>
  );
}

const SPARKS_BY_TIER: Record<LevelUpTier, number> = { normal: 12, milestone: 24, max: 24 };
const TAKEOVER_ICON_SIZE = 96;
const SUMMARY_TWO_COLUMNS_FROM = 6;

interface LevelUpTakeoverProps {
  timing: RevealTakeover;
  takeover: LevelUpTakeoverContent;
  nameOf: (skillKey: string) => string;
}

function LevelUpTakeover({ timing, takeover, nameOf }: LevelUpTakeoverProps) {
  const { tier, entries } = takeover;
  const [single] = entries;
  const animation = { animationDelay: `${timing.startS}s`, animationDuration: `${timing.endS - timing.startS}s` };
  return (
    <div className="level-up-takeover" aria-hidden="true" style={animation}>
      <div className={`panel takeover-card tier-${tier}${entries.length > 1 ? ' summary' : ''}`} style={animation}>
        <span className="takeover-sparks">
          {Array.from({ length: SPARKS_BY_TIER[tier] }, (_, spark) => (
            <span key={spark} className="spark" />
          ))}
        </span>
        {entries.length === 1 && single !== undefined ? (
          <>
            <SkillIcon skillKey={single.skill} size={TAKEOVER_ICON_SIZE} />
            <span className="takeover-kicker">{takeoverKicker(tier, 1)}</span>
            <span className="takeover-skill">{nameOf(single.skill)}</span>
            <span className="takeover-level">Level {single.to}</span>
          </>
        ) : (
          <>
            <span className="takeover-kicker">{takeoverKicker(tier, entries.length)}</span>
            <ul className={entries.length >= SUMMARY_TWO_COLUMNS_FROM ? 'takeover-list wide' : 'takeover-list'}>
              {entries.map((entry) => (
                <li key={entry.skill} className={`tier-${entry.tier}`}>
                  <SkillIcon skillKey={entry.skill} />
                  <span className="takeover-entry-name">{nameOf(entry.skill)}</span>
                  <span className="takeover-entry-level">{entry.to}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

interface QuestPanelProps {
  reveal: QuestReveal;
  delayS: number;
}

function QuestPanel({ reveal, delayS }: QuestPanelProps) {
  return (
    <section
      className="panel stack rise"
      aria-labelledby="reveal-quests-heading"
      style={{ animationDelay: `${delayS}s` }}
    >
      <div className="row spread">
        <h2 id="reveal-quests-heading">Quests</h2>
        <Link className="tiny" to="/skills/quests">
          See quests
        </Link>
      </div>
      {reveal.completed.map((line) => (
        <p className="stack" key={line.questId}>
          <strong className="accent-text">{line.text}</strong>
          {line.detail && <span className="muted">{line.detail}</span>}
        </p>
      ))}
      {reveal.progressed.length > 0 && (
        <ul className="quest-list" aria-label="Quest progress">
          {reveal.progressed.map((line) => (
            <li key={line.questId}>
              {line.text}
              {line.detail && <span className="muted"> · {line.detail}</span>}
            </li>
          ))}
        </ul>
      )}
      {reveal.unlocked.map((text) => (
        <p key={text}>{text}</p>
      ))}
      {reveal.levelUps.length > 0 && (
        <ul className="level-up-grid" aria-label="Level ups from quests">
          {reveal.levelUps.map((levelUp) => (
            <li key={levelUp.skillName}>
              {levelUp.skillName}
              <span className="pixel">
                {levelUp.from} → {levelUp.to}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface RevealScreenProps {
  userId: string;
}

export function RevealScreen({ userId }: RevealScreenProps) {
  const location = useLocation();
  const routedSummary = location.state as FinishSummary | null;
  const outcome = routedSummary ? finishOutcomeOf(routedSummary) : recallFinishOutcome(userId);
  const summary = outcome?.summary ?? null;
  const { unitPref } = usePreferences();
  const exercises = useQuery(exerciseListQuery(userId)).data ?? [];
  const standing = loadedAfterMount(useQuery({ ...standingQuery(userId), refetchOnMount: 'always' }));
  const skills = useQuery(skillsQuery).data ?? standing?.skills.map(({ skill }) => skill) ?? NO_SKILLS;
  const xpBySkillId = standing && new Map(standing.skills.map(({ skill, progress }) => [skill.id, progress.xp]));
  const itemCatalog = useQuery(itemCatalogQuery(userId));
  const items: LoadedItems = itemCatalog.data?.loaded.items ?? (itemCatalog.isError ? 'failed' : 'loading');
  const freshDrops = useQuery({
    ...finishLootQuery(userId, outcome?.sessionIds ?? []),
    enabled: outcome !== null,
    refetchOnMount: 'always',
  }).data;
  const hasQuestNews = summary?.quests !== undefined;
  const questLog = loadedAfterMount(
    useQuery({ ...questsQuery(userId), enabled: hasQuestNews, refetchOnMount: 'always' }),
  );
  const sessionId = summary?.sessionId;
  const timeline = revealTimeline(revealShape(summary));
  const takeoverContent = levelUpTakeover(summary?.levelUps ?? []);
  const cueTier = takeoverContent?.tier ?? null;
  const title = useRef<HTMLHeadingElement>(null);
  const xpHeadingId = useId();
  const recordsHeadingId = useId();
  const { phase, skip } = useRevealPlayback(userId, timeline, cueTier, title, playsReveal(summary));

  useEffect(() => {
    if (sessionId) markInstallCardDue(userId);
  }, [sessionId, userId]);

  if (!summary) {
    return (
      <main className="screen stack">
        <p className="panel">No finished workout to show yet.</p>
        <Link className="button" to="/">
          Back to workout
        </Link>
      </main>
    );
  }

  const timingText = sessionTimingParts(summary, { labelDuration: true }).join(' · ');
  const unappliedText = unappliedChangesText(summary);
  const unappliedNotice = unappliedText && (
    <p className="notice" role="status">
      {unappliedText}{' '}
      {!summary.historyOnly && (
        <Link to={`/collection/history/${summary.sessionId}`} replace>
          Open this workout
        </Link>
      )}
    </p>
  );

  const notAppliedText = challengeNotAppliedText(summary, summary.plannedChallenge ?? null);
  const notAppliedNotice = notAppliedText && (
    <p className="notice" role="status">
      {notAppliedText}
    </p>
  );

  if (summary.historyOnly) {
    return (
      <main className="screen stack">
        <h1 className="title">Workout saved</h1>
        {timingText && <p className="muted">{timingText}</p>}
        <p className="panel" role="status">
          Saved to history (older than 7 days, no XP)
        </p>
        {unappliedNotice}
        {notAppliedNotice}
        <Link className="button" to="/">
          Done
        </Link>
      </main>
    );
  }

  const nameOf = (skillKey: string) => skills.find((skill) => skill.key === skillKey)?.name ?? skillKey;
  const skillsWithXp = skills.filter((skill) => summary.xpBySkill[skill.key]);
  const totalXp = sessionXp(summary);
  const leveledUp = new Map(summary.levelUps.map((levelUp) => [levelUp.skill, levelUp]));
  const headline = challengeHeadline(summary);
  const questReveal = questRevealLines(summary, questLog, skills, unitPref);
  const failReason = challengeFailReason(
    summary,
    summary.plannedChallenge ?? null,
    (exerciseId) => exercises.find((exercise) => exercise.id === exerciseId)?.name ?? 'Exercise',
    unitPref,
  );

  return (
    <main className={phase === 'playing' ? 'screen stack' : 'screen stack reveal-still'}>
      <header className="reveal-header">
        <h1 className="title" ref={title} tabIndex={-1}>
          Workout complete!
        </h1>
        <span className="reveal-total pop">
          +<CountUp value={totalXp} durationMs={TOTAL_COUNT_UP_MS} animate={phase === 'playing'} format={formatXp} /> XP
        </span>
        {phase === 'playing' && (
          <button type="button" className="button reveal-skip" onClick={skip}>
            Skip
          </button>
        )}
      </header>
      {phase === 'playing' && timeline.takeover && takeoverContent && (
        <LevelUpTakeover timing={timeline.takeover} takeover={takeoverContent} nameOf={nameOf} />
      )}
      {timingText && <p className="muted">{timingText}</p>}
      {unappliedNotice}
      {notAppliedNotice}
      {headline && (
        <section className="panel stack" aria-label="Challenge">
          <p className={summary.challenge?.passed ? 'accent-text' : undefined}>{headline}</p>
          {failReason && <p className="muted">{failReason}</p>}
        </section>
      )}
      <section className="panel stack">
        <h2 id={xpHeadingId}>XP gained</h2>
        <ul className="reveal-list" aria-labelledby={xpHeadingId}>
          {skillsWithXp.map((skill, index) => {
            const gain = summary.xpBySkill[skill.key];
            const levelUp = leveledUp.get(skill.key);
            const xpAfter = xpBySkillId?.get(skill.id);
            const challengeBonus = bonusText('Challenge', summary.challengeBonusBySkill, skill.key);
            const gearBonus = bonusText('Gear', summary.gearBonusBySkill, skill.key);
            return (
              <li
                key={skill.key}
                className="skill-gain rise"
                style={{ animationDelay: `${timeline.skillDelaysS[index] ?? 0}s` }}
              >
                <SkillIcon skillKey={skill.key} />
                <div className="skill-gain-body">
                  <div className="row spread">
                    <span>
                      {skill.name}: <strong>+{formatXp(gain)} XP</strong>
                    </span>
                    {levelUp ? (
                      <span className="accent-text tiny">lvl {levelUp.to} ▲</span>
                    ) : (
                      xpAfter !== undefined && <span className="muted tiny">lvl {levelProgress(xpAfter).level}</span>
                    )}
                  </div>
                  {challengeBonus && <span className="muted tiny">{challengeBonus}</span>}
                  {gearBonus && <span className="muted tiny">{gearBonus}</span>}
                  {xpAfter !== undefined && (
                    <GainBar
                      skillName={skill.name}
                      xpAfter={xpAfter}
                      gain={gain}
                      delaySeconds={timeline.barDelaysS[index] ?? 0}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
      {summary.levelUps.length > 0 && (
        <section className="panel stack level-ups pop" style={{ animationDelay: `${timeline.levelUpDelayS ?? 0}s` }}>
          <h2 className="row">
            <LevelUpIcon />
            Level up!
          </h2>
          <ul className="level-up-grid" aria-label="Level ups">
            {summary.levelUps.map((levelUp) => (
              <li key={levelUp.skill}>
                {nameOf(levelUp.skill)}
                <span className="pixel">
                  {levelUp.from} → {levelUp.to}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {summary.prs.length > 0 && (
        <section className="panel stack rise" style={{ animationDelay: `${timeline.recordsDelayS ?? 0}s` }}>
          <h2 id={recordsHeadingId}>New records</h2>
          <ul className="record-list" aria-labelledby={recordsHeadingId}>
            {summary.prs.map((record, index) => {
              const described = describeRecord(
                record,
                exercises.find((exercise) => exercise.id === record.exerciseId),
                unitPref,
              );
              return (
                <li key={`${record.exerciseId}-${index}`}>
                  <TrophyIcon />
                  <span className="stack" style={{ gap: 'var(--space-0-5)' }}>
                    <span className="muted tiny">New record</span>
                    <span>
                      <span className="pixel">{described.headline}</span>{' '}
                      <span className="muted">{described.previous}</span>
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {questReveal && <QuestPanel reveal={questReveal} delayS={timeline.lootDelayS} />}
      <LootPanel userId={userId} drops={freshDrops ?? summary.drops ?? []} items={items} delayS={timeline.lootDelayS} />
      {summary.days && summary.days.length > 1 && (
        <ul className="menu-list" aria-label="Workouts saved">
          {summary.days.map((day) => (
            <li key={day.sessionId}>
              <Link className="button" to={`/collection/history/${day.sessionId}`}>
                Open {day.label ?? 'workout'}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link className="button primary big" to="/">
        Done
      </Link>
      <Link className="button" to="/skills">
        See skills
      </Link>
    </main>
  );
}
