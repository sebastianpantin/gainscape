import { levelProgress } from '@domain/index.ts';
import type { DropSummary } from '@domain/types.ts';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ItemIcon, LevelUpIcon, SkillIcon, TrophyIcon } from '../../components/PixelArt.tsx';
import { fetchExercises, fetchSkills, fetchSkillXp } from '../../lib/catalog.ts';
import type { Exercise, Skill } from '../../lib/catalog-rules.ts';
import { formatXp, sessionXp } from '../../lib/format.ts';
import { fetchSession } from '../../lib/history.ts';
import { type CatalogItem, colorFor } from '../../lib/item-rules.ts';
import { fetchItemCatalog } from '../../lib/items.ts';
import { usePreferences } from '../../lib/preferences.ts';
import { sessionTimingParts } from '../../lib/session-timing-rules.ts';
import type { CompletedSessionSummary } from '../../offline/finish-lock.ts';
import { markInstallCardDue } from '../../pwa/install.ts';
import { recallLastSummary, rememberLastSummary } from './last-summary.ts';
import {
  challengeBonusText,
  challengeFailReason,
  challengeHeadline,
  describeRecord,
  gearBonusText,
} from './reveal-rules.ts';

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

function LootPanel({ drops, items }: { drops: readonly DropSummary[]; items: LoadedItems }) {
  return (
    <section className="panel stack rise" aria-label="Loot" style={{ animationDelay: '2s' }}>
      <div className="row spread">
        <h2>Loot</h2>
        <Link className="tiny" to="/collection/items">
          See items
        </Link>
      </div>
      {drops.length === 0 ? (
        <p className="muted">No loot this time</p>
      ) : items === 'loading' ? (
        <p className="muted">Loading loot…</p>
      ) : items === 'failed' ? (
        <p className="muted">Couldn't load the loot names. See items for what dropped.</p>
      ) : (
        <ul className="record-list" aria-label="Loot drops">
          {drops.map((drop) => {
            const item = items.find((candidate) => candidate.id === drop.itemId);
            return (
              <li key={drop.dropId}>
                <ItemIcon kind={item?.icon ?? 'scraps'} color={item ? colorFor(item) : colorFor({ tier: null })} />
                <span style={{ flex: 1 }}>{item?.name ?? 'Unknown item'}</span>
                <span className="pixel">×{drop.quantity}</span>
                {drop.source === 'pr' && <span className="accent-text tiny">PR</span>}
              </li>
            );
          })}
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
  const summary = (location.state as CompletedSessionSummary | null) ?? recallLastSummary();
  const { unitPref } = usePreferences();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [xpBySkillId, setXpBySkillId] = useState<Map<string, number> | null>(null);
  const [items, setItems] = useState<LoadedItems>('loading');
  const [freshDrops, setFreshDrops] = useState<DropSummary[] | null>(null);
  const sessionId = summary?.sessionId;

  useEffect(() => {
    if (sessionId) markInstallCardDue(userId);
  }, [sessionId, userId]);

  useEffect(() => {
    fetchSkills().then(setSkills, () => setSkills([]));
    fetchExercises({ includeArchived: true }).then(setExercises, () => setExercises([]));
    fetchSkillXp(userId).then(setXpBySkillId, () => setXpBySkillId(null));
    fetchItemCatalog().then(
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
        const cached = recallLastSummary();
        if (cached?.sessionId === sessionId) rememberLastSummary({ ...cached, drops: stored.summary.drops ?? [] });
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [sessionId]);

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

  if (summary.historyOnly) {
    return (
      <main className="screen stack">
        <h1 className="title">Workout saved</h1>
        {timingText && <p className="muted">{timingText}</p>}
        <p className="panel" role="status">
          Saved to history (older than 7 days, no XP)
        </p>
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
    <main className="screen stack">
      <header className="reveal-header">
        <h1 className="title">Workout complete!</h1>
        <span className="reveal-total pop">+{formatXp(totalXp)} XP</span>
      </header>
      {timingText && <p className="muted">{timingText}</p>}
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
            <li key={skill.key} className="skill-gain rise" style={{ animationDelay: `${0.2 + index * 0.2}s` }}>
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
                  <GainBar skillName={skill.name} xpAfter={xpAfter} gain={gain} delaySeconds={0.4 + index * 0.2} />
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {summary.levelUps.length > 0 && (
        <section className="panel stack level-ups pop" style={{ animationDelay: '1.2s' }}>
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
        <ul className="panel record-list rise" aria-label="New records" style={{ animationDelay: '1.6s' }}>
          {summary.prs.map((record, index) => {
            const described = describeRecord(
              record,
              exercises.find((exercise) => exercise.id === record.exerciseId),
              unitPref,
            );
            return (
              <li key={`${record.exerciseId}-${index}`}>
                <TrophyIcon size={32} />
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
      <LootPanel drops={freshDrops ?? summary.drops ?? []} items={items} />
      <Link className="button primary big" to="/skills">
        See skills
      </Link>
      <Link className="button" to="/">
        Done
      </Link>
    </main>
  );
}
