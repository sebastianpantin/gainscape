import { levelProgress } from '@domain/index.ts';
import type { DropSummary } from '@domain/types.ts';
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ItemIcon, LevelUpIcon, LootChestIcon, SkillIcon, TrophyIcon } from '../../components/PixelArt.tsx';
import { fetchExercises, fetchSkills, fetchSkillXp } from '../../lib/catalog.ts';
import type { Exercise, Skill } from '../../lib/catalog-rules.ts';
import { playTones, primeAudio, type Tone, vibrate } from '../../lib/device-effects.ts';
import { formatXp, sessionXp } from '../../lib/format.ts';
import { GLOSSARY } from '../../lib/glossary.ts';
import { fetchSession } from '../../lib/history.ts';
import { type CatalogItem, colorFor } from '../../lib/item-rules.ts';
import { fetchItemCatalog } from '../../lib/items.ts';
import { usePreferences } from '../../lib/preferences.ts';
import { deviceStorage } from '../../lib/rest-timer-store.ts';
import { levelUpCues } from '../../lib/training-device-rules.ts';
import { readTrainingDeviceSettings } from '../../lib/training-device-store.ts';
import { isDeviceOffline, loadCacheFirstWhenOffline } from '../../offline/cache-first.ts';
import { savedExerciseList } from '../../offline/collection-cache.ts';
import { readItemsCache } from '../../offline/items-cache.ts';
import { standingCache } from '../../offline/standing-cache.ts';
import { sessionTimingParts } from '../../lib/session-timing-rules.ts';
import type { CompletedSessionSummary } from '../../offline/finish-lock.ts';
import { markInstallCardDue } from '../../pwa/install.ts';
import { recallLastSummary, rememberLastSummary } from './last-summary.ts';
import {
  challengeBonusText,
  challengeFailReason,
  challengeHeadline,
  challengeNotAppliedText,
  describeRecord,
  gearBonusText,
  levelUpCueDelayMs,
  type RevealTimeline,
  revealShape,
  revealTimeline,
  unappliedChangesText,
} from './reveal-rules.ts';

const LEVEL_UP_CHIME: Tone[] = [523, 659, 784, 1047].map((frequencyHz, index, notes) => ({
  frequencyHz,
  startS: index * 0.08,
  lengthS: index === notes.length - 1 ? 0.3 : 0.08,
}));
const LEVEL_UP_CHIME_VOLUME = 0.18;
const LEVEL_UP_VIBRATION_MS = [40, 50, 40, 50, 140];
const LOOT_DROP_STAGGER_S = 0.08;
const SKIP_KEYS = new Set(['Escape', 'Enter']);

async function savedWhenOffline<Loaded>(saved: Loaded | null, loadLive: () => Promise<Loaded>): Promise<Loaded> {
  return (await loadCacheFirstWhenOffline(isDeviceOffline, () => saved, loadLive)).loaded;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function cueLevelUp(userId: string): void {
  for (const cue of levelUpCues(readTrainingDeviceSettings(deviceStorage(), userId))) {
    if (cue === 'vibrate') vibrate(LEVEL_UP_VIBRATION_MS);
    if (cue === 'sound') playTones(LEVEL_UP_CHIME, LEVEL_UP_CHIME_VOLUME, 'triangle');
  }
}

type RevealPhase = 'playing' | 'settled' | 'skipped';

function useRevealPlayback(
  userId: string,
  timeline: RevealTimeline,
  focusAfterSkip: RefObject<HTMLElement | null>,
): { phase: RevealPhase; skip: () => void } {
  const [reducedMotion] = useState(prefersReducedMotion);
  const [phase, setPhase] = useState<RevealPhase>(reducedMotion ? 'settled' : 'playing');
  const skipped = useRef(false);
  const cueDelayMs = levelUpCueDelayMs(timeline, reducedMotion);
  const { settledAfterMs } = timeline;

  useEffect(() => {
    if (cueDelayMs === null) return;
    if (readTrainingDeviceSettings(deviceStorage(), userId).sound) primeAudio();
    const cue = setTimeout(() => {
      if (!skipped.current) cueLevelUp(userId);
    }, cueDelayMs);
    return () => clearTimeout(cue);
  }, [cueDelayMs, userId]);

  const skip = useCallback(() => {
    skipped.current = true;
    if (document.activeElement?.matches('.reveal-skip')) focusAfterSkip.current?.focus();
    setPhase('skipped');
  }, [focusAfterSkip]);

  useEffect(() => {
    if (phase !== 'playing') return;
    const settle = setTimeout(() => setPhase('settled'), settledAfterMs);
    const skipOnKey = (event: KeyboardEvent) => {
      if (SKIP_KEYS.has(event.key)) skip();
    };
    document.addEventListener('pointerdown', skip);
    document.addEventListener('keydown', skipOnKey);
    return () => {
      clearTimeout(settle);
      document.removeEventListener('pointerdown', skip);
      document.removeEventListener('keydown', skipOnKey);
    };
  }, [phase, settledAfterMs, skip]);

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
          <li key={drop.dropId} className="loot-drop" style={{ animationDelay: `${index * LOOT_DROP_STAGGER_S}s` }}>
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

function LootPanel({ drops, items, delayS }: { drops: readonly DropSummary[]; items: LoadedItems; delayS: number }) {
  const [open, setOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const hasDrops = drops.length > 0;

  const openLoot = () => {
    setOpen(true);
    heading.current?.focus();
  };

  return (
    <section className="panel stack rise" aria-label="Loot" style={{ animationDelay: `${delayS}s` }}>
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

interface RevealScreenProps {
  userId: string;
}

export function RevealScreen({ userId }: RevealScreenProps) {
  const location = useLocation();
  const summary = (location.state as CompletedSessionSummary | null) ?? recallLastSummary(userId);
  const { unitPref } = usePreferences();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [xpBySkillId, setXpBySkillId] = useState<Map<string, number> | null>(null);
  const [items, setItems] = useState<LoadedItems>('loading');
  const [freshDrops, setFreshDrops] = useState<DropSummary[] | null>(null);
  const sessionId = summary?.sessionId;
  const timeline = revealTimeline(revealShape(summary));
  const title = useRef<HTMLHeadingElement>(null);
  const { phase, skip } = useRevealPlayback(userId, timeline, title);

  useEffect(() => {
    if (sessionId) markInstallCardDue(userId);
  }, [sessionId, userId]);

  useEffect(() => {
    const storage = deviceStorage();
    const standing = standingCache.read(storage, userId);
    savedWhenOffline(standing?.skills ?? null, fetchSkills).then(setSkills, () => setSkills([]));
    savedWhenOffline(savedExerciseList(storage, userId), () => fetchExercises({ includeArchived: true })).then(
      setExercises,
      () => setExercises([]),
    );
    savedWhenOffline(standing && new Map(Object.entries(standing.xpBySkillId)), () => fetchSkillXp(userId)).then(
      setXpBySkillId,
      () => setXpBySkillId(null),
    );
    savedWhenOffline(readItemsCache(storage, userId)?.catalog ?? null, fetchItemCatalog).then(
      (catalog) => setItems(catalog.items),
      () => setItems('failed'),
    );
  }, [userId]);

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
        <span className="reveal-total pop">+{formatXp(totalXp)} XP</span>
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
      <LootPanel drops={freshDrops ?? summary.drops ?? []} items={items} delayS={timeline.lootDelayS} />
      <Link className="button primary big" to="/skills">
        See skills
      </Link>
      <Link className="button" to="/">
        Done
      </Link>
    </main>
  );
}
