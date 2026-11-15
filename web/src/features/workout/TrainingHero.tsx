import { levelProgress } from '@domain/index.ts';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useId } from 'react';
import { Link } from 'react-router-dom';
import { CharacterFigure, GymScene } from '../../components/PixelArt.tsx';
import { ProgressBar } from '../../components/ProgressBar.tsx';
import { characterLabel, characterLinkLabel, characterLook } from '../../lib/collection/character-rules.ts';
import { type EquippedGear } from '../../lib/collection/gear-rules.ts';
import { type BadgeColor } from '../../lib/profile/profile-rules.ts';
import { type UnitPref } from '../../lib/profile/profile.ts';
import { type Scene, sceneFor, sceneLabel } from '../../lib/progress/scene-rules.ts';
import { type StandingState } from '../../lib/progress/standing.ts';
import {
  loadoutQuery,
  profileQuery,
  questPointsQuery,
  questsQuery,
  recordTimelineQuery,
} from '../../lib/query/queries.ts';
import { activeQuestLine } from '../../lib/quests/quest-rules.ts';
import { skillXpMetric } from '../../lib/ui/last-seen-number-store.ts';
import { useCountUp } from '../../lib/ui/use-count-up.ts';
import { PetCompanion } from './PetCompanion.tsx';
import { useCompanionPet } from './use-companion-pet.ts';
import { usePetMood } from './use-pet-mood.ts';
import { useSceneGrowth } from './use-scene-growth.ts';
import { type NearestLevelUp, nearestLevelUp, nearestLevelUpText, nearestLevelUpValueText } from './today-rules.ts';

const SCENE_CHARACTER_SIZE = 96;

function CharacterLink({ slots, badgeColor }: { slots: readonly EquippedGear[]; badgeColor: BadgeColor }) {
  return (
    <Link className="hero-character-link" to="/collection/items" aria-label={characterLinkLabel(slots)}>
      <CharacterFigure
        look={characterLook(slots, badgeColor)}
        label={characterLabel(slots)}
        size={SCENE_CHARACTER_SIZE}
      />
    </Link>
  );
}

function LevelUpBar({ userId, levelUp }: { userId: string; levelUp: NearestLevelUp }) {
  const { shown } = useCountUp(userId, skillXpMetric(levelUp.skillKey), levelUp.xp);
  const valueText = nearestLevelUpValueText(levelUp);
  return (
    <div className="stack hero-bar">
      <Link className="tap-link" to="/skills">
        {nearestLevelUpText(levelUp)}
      </Link>
      <ProgressBar
        fraction={levelUp.xpIntoLevel / levelUp.levelXp}
        shownFraction={levelProgress(shown).fractionToNextLevel}
        label={`${levelUp.skillName} XP to level ${levelUp.nextLevel}`}
        valueText={valueText}
      />
      <span className="muted tiny" aria-hidden="true">
        {valueText}
      </span>
    </div>
  );
}

interface TrainingHeroProps {
  userId: string;
  standing: StandingState;
  today: string | null;
  trainedDates: readonly string[] | undefined;
  hour: number;
}

function useScene(userId: string, standing: StandingState, hour: number): Scene | null {
  const records = useInfiniteQuery(recordTimelineQuery(userId)).data?.pages[0]?.loaded;
  const questPoints = useQuery(questPointsQuery(userId)).data;
  if (standing.status !== 'ready') return null;
  return sceneFor({
    totalLevel: standing.standing.totalLevel,
    recordCount: records?.length ?? 0,
    questPoints: questPoints ?? 0,
    hour,
  });
}

export function TrainingHero({ userId, standing, today, trainedDates, hour }: TrainingHeroProps) {
  const headingId = useId();
  const pet = useCompanionPet(userId);
  const mood = usePetMood(userId, today, trainedDates);
  const loadout = useQuery(loadoutQuery(userId));
  const equipped = loadout.isSuccess ? (loadout.data?.slots ?? []) : null;
  const badgeColor = useQuery(profileQuery(userId)).data?.loaded.badgeColor ?? null;
  const scene = useScene(userId, standing, hour);
  const growthText = useSceneGrowth(userId, scene?.stage ?? null);

  return (
    <section className="panel training-hero" aria-labelledby={headingId}>
      <h2 id={headingId} className="visually-hidden">
        Your gym
      </h2>
      <div className="training-scene">
        <GymScene scene={scene} label={scene && sceneLabel(scene)} />
        {badgeColor !== null && equipped !== null && (
          <span className="scene-character">
            <CharacterLink slots={equipped} badgeColor={badgeColor} />
          </span>
        )}
        {pet && (
          <span className="scene-pet">
            <PetCompanion pet={pet} mood={mood} />
          </span>
        )}
      </div>
      {growthText && (
        <p className="notice scene-grew" role="status">
          {growthText}
        </p>
      )}
    </section>
  );
}

export function NextLevelCard({ userId, standing }: { userId: string; standing: StandingState }) {
  const headingId = useId();
  const levelUp = standing.status === 'ready' ? nearestLevelUp(standing.standing.skills) : null;

  if (!levelUp) return null;
  return (
    <section className="panel" aria-labelledby={headingId}>
      <h2 id={headingId} className="visually-hidden">
        Next level
      </h2>
      <LevelUpBar userId={userId} levelUp={levelUp} />
    </section>
  );
}

export function ActiveQuestCard({ userId, unit }: { userId: string; unit: UnitPref }) {
  const headingId = useId();
  const questLog = useQuery(questsQuery(userId)).data?.loaded;
  const quest = questLog ? activeQuestLine(questLog, unit) : null;

  if (!quest) return null;
  return (
    <section className="panel stack hero-bar" aria-labelledby={headingId}>
      <h2 id={headingId} className="visually-hidden">
        Active quest
      </h2>
      <Link className="tap-link" to="/skills/quests">
        {quest.questName}
      </Link>
      <span className="muted tiny">{quest.stepText}</span>
      <ProgressBar fraction={quest.fraction} label={`${quest.questName} progress`} valueText={quest.progressText} />
      <span className="muted tiny" aria-hidden="true">
        {quest.progressText}
      </span>
    </section>
  );
}
