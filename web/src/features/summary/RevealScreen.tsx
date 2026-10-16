import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { levelProgress } from '@domain/index.ts';
import type { DropSummary } from '@domain/types.ts';
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CountUp } from '../../components/CountUp.tsx';
import { ItemIcon, LevelUpIcon, LootChestIcon, SkillIcon, TrophyIcon } from '../../components/PixelArt.tsx';
import type { Skill } from '../../lib/exercises/catalog-rules.ts';
import {
  celebrate,
  FANFARE_CELEBRATIONS,
  LEVEL_UP_CELEBRATION,
  primeCelebrationAudio,
} from '../../lib/platform/celebration-effects.ts';
import { prefersReducedMotion } from '../../lib/platform/device-effects.ts';
import { formatXp, sessionXp } from '../../lib/format.ts';
import { GLOSSARY } from '../../lib/ui/glossary.ts';
import { fetchSession } from '../../lib/history/history.ts';
import { type CatalogItem, colorFor, fanfareFor } from '../../lib/collection/item-rules.ts';
import { usePreferences } from '../../lib/profile/preferences.ts';
import { sessionTimingParts } from '../../lib/workout/session-timing-rules.ts';
import { type CacheFirstLoad } from '../../offline/cache-first.ts';
import type { CompletedSessionSummary } from '../../offline/finish-lock.ts';
import { markInstallCardDue } from '../../pwa/install.ts';
import {
  exerciseListQuery,
  itemCatalogQuery,
  questsQuery,
  skillsQuery,
  standingQuery,
} from '../../lib/query/queries.ts';
import { recallLastSummary, rememberLastSummary } from './last-summary.ts';
import {
  challengeBonusText,
  challengeFailReason,
  challengeHeadline,
  challengeNotAppliedText,
  describeRecord,
  gearBonusText,
  levelUpCueDelayMs,
  playsReveal,
  type QuestReveal,
  questRevealLines,
  type RevealTimeline,
  revealShape,
  revealTimeline,
  skipsRevealOnKey,
  unappliedChangesText,
} from './reveal-rules.ts';

const TOTAL_COUNT_UP_MS = 900;
const LEGENDARY_GLOW_AFTER_POP_S = 0.35;

function dropAnimationDelay(popDelayS: number, glows: boolean): string {
  return glows ? `${popDelayS}s, ${popDelayS + LEGENDARY_GLOW_AFTER_POP_S}s` : `${popDelayS}s`;
}
const LOOT_DROP_STAGGER_S = 0.08;
const INTERACTIVE_ELEMENTS = 'a[href], button, input, select, textarea, summary, [role="button"], [role="link"]';

const NO_SKILLS: readonly Skill[] = [];

function loadedAfterMount<Loaded>(query: UseQueryResult<CacheFirstLoad<Loaded>>): Loaded | null {
  return query.isFetchedAfterMount && query.isSuccess ? query.data.loaded : null;
}

type RevealPhase = 'playing' | 'settled' | 'skipped';

function useRevealPlayback(
  userId: string,
  timeline: RevealTimeline,
  focusAfterSkip: RefObject<HTMLElement | null>,
  plays: boolean,
): { phase: RevealPhase; skip: () => void } {
  const [reducedMotion] = useState(prefersReducedMotion);
  const [phase, setPhase] = useState<RevealPhase>(reducedMotion ? 'settled' : 'playing');
  const skipped = useRef(false);
  const cueDelayMs = levelUpCueDelayMs(timeline, reducedMotion);
  const { settledAfterMs } = timeline;

  useEffect(() => {
    if (cueDelayMs === null) return;
    primeCelebrationAudio(userId);
    const cue = setTimeout(() => {
      if (!skipped.current) celebrate(userId, LEVEL_UP_CELEBRATION);
    }, cueDelayMs);
    return () => clearTimeout(cue);
  }, [cueDelayMs, userId]);

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
    document.addEventListener('pointerdown', skip);
    document.addEventListener('keydown', skipOnKey);
    return () => {
      clearTimeout(settle);
      document.removeEventListener('pointerdown', skip);
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
    <div
      className="meter"
      role="img"
      aria-label={`${skillName} ${Math.round(endFraction * 100)}% of the way to level ${after.level + 1}`}
    >
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
  );
}

type LoadedItems = CatalogItem[] | 'loading' | 'failed';

function LootDrops({ drops, items }: { drops: readonly DropSummary[]; items: LoadedItems }) {
  if (items === 'loading') return <p className="muted">Loading loot…</p>;
  if (items === 'failed') return <p className="muted">Couldn't load the loot names. See items for what dropped.</p>;
  return (
    <ul className="record-list" aria-label="Loot drops">
      {drops.map((drop, index) => {
        const item = items.find((candidate) => candidate.id === drop.itemId);
        return (
          <li
            key={drop.dropId}
            className={item ? `loot-drop rarity-${item.rarity}` : 'loot-drop'}
            style={{ animationDelay: dropAnimationDelay(index * LOOT_DROP_STAGGER_S, item?.rarity === 'legendary') }}
          >
            <ItemIcon kind={item?.icon ?? 'scraps'} color={item ? colorFor(item) : colorFor({ tier: null })} />
            <span style={{ flex: 1 }}>{item?.name ?? 'Unknown item'}</span>
            <span className="pixel">×{drop.quantity}</span>
            {drop.source === 'pr' && (
              <span className="accent-text tiny" role="img" aria-label={GLOSSARY.pr.name}>
                PR
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

interface LootPanelProps {
  userId: string;
  drops: readonly DropSummary[];
  items: LoadedItems;
  delayS: number;
}

function LootPanel({ userId, drops, items, delayS }: LootPanelProps) {
  const [open, setOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const hasDrops = drops.length > 0;
  const fanfare = Array.isArray(items)
    ? fanfareFor(drops.flatMap((drop) => items.find((candidate) => candidate.id === drop.itemId)?.rarity ?? []))
    : null;

  const flashes = open && fanfare !== null;

  const openLoot = () => {
    setOpen(true);
    heading.current?.focus();
    if (fanfare) celebrate(userId, FANFARE_CELEBRATIONS[fanfare]);
  };

  return (
    <section
      className={flashes ? `panel stack loot-${fanfare}` : 'panel stack rise'}
      aria-label="Loot"
      style={flashes ? undefined : { animationDelay: `${delayS}s` }}
    >
      <div className="row spread">
        <h2 ref={heading} tabIndex={-1}>
          Loot
        </h2>
        <Link className="tiny" to="/collection/items">
          See items
        </Link>
      </div>
      {!hasDrops && <p className="muted">No loot this time</p>}
      {hasDrops && !open && (
        <button type="button" className="loot-chest" onClick={openLoot}>
          <span className="loot-chest-art">
            <LootChestIcon />
          </span>
          Open loot
        </button>
      )}
      {hasDrops && <div role="status">{open && <LootDrops drops={drops} items={items} />}</div>}
    </section>
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
  const summary = (location.state as CompletedSessionSummary | null) ?? recallLastSummary(userId);
  const { unitPref } = usePreferences();
  const exercises = useQuery(exerciseListQuery(userId)).data ?? [];
  const standing = loadedAfterMount(useQuery({ ...standingQuery(userId), refetchOnMount: 'always' }));
  const skills = useQuery(skillsQuery).data ?? standing?.skills.map(({ skill }) => skill) ?? NO_SKILLS;
  const xpBySkillId = standing && new Map(standing.skills.map(({ skill, progress }) => [skill.id, progress.xp]));
  const itemCatalog = useQuery(itemCatalogQuery(userId));
  const items: LoadedItems = itemCatalog.data?.loaded.items ?? (itemCatalog.isError ? 'failed' : 'loading');
  const [freshDrops, setFreshDrops] = useState<DropSummary[] | null>(null);
  const hasQuestNews = summary?.quests !== undefined;
  const questLog = loadedAfterMount(
    useQuery({ ...questsQuery(userId), enabled: hasQuestNews, refetchOnMount: 'always' }),
  );
  const sessionId = summary?.sessionId;
  const timeline = revealTimeline(revealShape(summary));
  const title = useRef<HTMLHeadingElement>(null);
  const { phase, skip } = useRevealPlayback(userId, timeline, title, playsReveal(summary));

  useEffect(() => {
    if (sessionId) markInstallCardDue(userId);
  }, [sessionId, userId]);

  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    fetchSession(sessionId).then(
      (stored) => {
        if (!active || !stored) return;
        setFreshDrops(stored.summary.drops ?? []);
        const cached = recallLastSummary(userId);
        if (cached?.sessionId === sessionId)
          rememberLastSummary(userId, { ...cached, drops: stored.summary.drops ?? [] });
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
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

  const timingText = sessionTimingParts(summary).join(' · ');
  const unappliedText = unappliedChangesText(summary);
  const unappliedNotice = unappliedText && (
    <p className="notice" role="status">
      {unappliedText}{' '}
      {!summary.historyOnly && <Link to={`/collection/history/${summary.sessionId}`}>Open this workout</Link>}
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
      {timingText && <p className="muted">{timingText}</p>}
      {unappliedNotice}
      {notAppliedNotice}
      {headline && (
        <section className="panel stack" aria-label="Challenge">
          <p className={summary.challenge?.passed ? 'accent-text' : undefined}>{headline}</p>
          {failReason && <p className="muted">{failReason}</p>}
        </section>
      )}
      <ul className="panel reveal-list" aria-label="XP gained">
        {skillsWithXp.map((skill, index) => {
          const gain = summary.xpBySkill[skill.key];
          const levelUp = leveledUp.get(skill.key);
          const xpAfter = xpBySkillId?.get(skill.id);
          const challengeBonus = challengeBonusText(summary, skill.key);
          const gearBonus = gearBonusText(summary, skill.key);
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
        <ul
          className="panel record-list rise"
          aria-label="New records"
          style={{ animationDelay: `${timeline.recordsDelayS ?? 0}s` }}
        >
          {summary.prs.map((record, index) => {
            const described = describeRecord(
              record,
              exercises.find((exercise) => exercise.id === record.exerciseId),
              unitPref,
            );
            return (
              <li key={`${record.exerciseId}-${index}`}>
                <TrophyIcon />
                <span className="stack" style={{ gap: 2 }}>
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
      )}
      {questReveal && <QuestPanel reveal={questReveal} delayS={timeline.lootDelayS} />}
      <LootPanel userId={userId} drops={freshDrops ?? summary.drops ?? []} items={items} delayS={timeline.lootDelayS} />
      <Link className="button primary big" to="/skills">
        See skills
      </Link>
      <Link className="button" to="/">
        Done
      </Link>
    </main>
  );
}
