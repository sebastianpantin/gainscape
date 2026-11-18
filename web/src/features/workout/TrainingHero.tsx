import { levelProgress } from '@domain/index.ts';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { type CharacterPose } from '../../components/character-sprites.ts';
import { CharacterFigure, GymScene, LootChestIcon, QuestScrollIcon } from '../../components/PixelArt.tsx';
import { ProgressBar } from '../../components/ProgressBar.tsx';
import {
  characterLabel,
  characterLinkLabel,
  characterLook,
  type SkillLevels,
} from '../../lib/collection/character-rules.ts';
import { type EquippedGear } from '../../lib/collection/gear-rules.ts';
import { type BadgeColor } from '../../lib/profile/profile-rules.ts';
import { type UnitPref } from '../../lib/profile/profile.ts';
import { type Scene, sceneFor, sceneLabel } from '../../lib/progress/scene-rules.ts';
import { type StandingState } from '../../lib/progress/standing.ts';
import { skillLevelsByKey } from '../../lib/progress/standing-rules.ts';
import {
  loadoutQuery,
  profileQuery,
  questPointsQuery,
  questsQuery,
  recordTimelineQuery,
  weeklyGoalQuery,
} from '../../lib/query/queries.ts';
import { activeQuestLine } from '../../lib/quests/quest-rules.ts';
import { skillXpMetric } from '../../lib/ui/last-seen-number-store.ts';
import { useCountUp } from '../../lib/ui/use-count-up.ts';
import { hasUnopenedFinishLoot } from '../../offline/finish-outcome.ts';
import { characterPoseFrom } from './character-pose-rules.ts';
import { PetCompanion } from './PetCompanion.tsx';
import { petMoodFrom } from './pet-mood-rules.ts';
import { useCompanionPet } from './use-companion-pet.ts';
import { useLastTrainedDate } from './use-last-trained-date.ts';
import { useSceneGrowth } from './use-scene-growth.ts';
import { type NearestLevelUp, nearestLevelUp, nearestLevelUpText, nearestLevelUpValueText } from './today-rules.ts';

const SCENE_CHARACTER_SIZE = 96;
const SCENE_CHEST_SIZE = 36;
const SCENE_SCROLL_SIZE = 24;

interface CharacterLinkProps {
  slots: readonly EquippedGear[];
  badgeColor: BadgeColor;
  skillLevels: SkillLevels | null;
  pose: CharacterPose;
}

function CharacterLink({ slots, badgeColor, skillLevels, pose }: CharacterLinkProps) {
  return (
    <Link className="hero-character-link" to="/collection/items" aria-label={characterLinkLabel(slots, pose)}>
      <CharacterFigure
        look={characterLook(slots, badgeColor, skillLevels)}
        label={characterLabel(slots, pose)}
        pose={pose}
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

function QuestScrollLink({ userId, unit }: { userId: string; unit: UnitPref }) {
  const questLog = useQuery(questsQuery(userId)).data?.loaded;
  const quest = questLog ? activeQuestLine(questLog, unit) : null;
  if (!quest) return null;
  return (
    <Link className="scene-quest" to="/skills/quests" aria-label={`Quest: ${quest.questName}. Open Quests`}>
      <span className="scene-quest-art" aria-hidden="true">
        <QuestScrollIcon size={SCENE_SCROLL_SIZE} />
      </span>
    </Link>
  );
}

function LootChestLink({ userId }: { userId: string }) {
  const [waiting] = useState(() => hasUnopenedFinishLoot(userId));
  if (!waiting) return null;
  return (
    <Link className="scene-chest" to="/reveal" aria-label="Loot from your last workout. Open the reveal">
      <span className="scene-chest-art" aria-hidden="true">
        <LootChestIcon size={SCENE_CHEST_SIZE} />
      </span>
    </Link>
  );
}

interface TrainingHeroProps {
  userId: string;
  standing: StandingState;
  unit: UnitPref;
  today: string | null;
  trainedDates: readonly string[] | undefined;
  hour: number;
}

function useRecordDates(userId: string): readonly string[] | undefined {
  const records = useInfiniteQuery(recordTimelineQuery(userId));
  if (records.isError) return [];
  return records.data?.pages[0]?.loaded.map((record) => record.local_date);
}

interface SceneFacts {
  totalLevel: number;
  skillLevels: SkillLevels;
  recordCount: number;
  hour: number;
}

function useScene(userId: string, facts: SceneFacts | null): Scene | null {
  const questPoints = useQuery(questPointsQuery(userId)).data;
  const weeklyGoal = useQuery(weeklyGoalQuery).data;
  if (facts === null) return null;
  return sceneFor({
    ...facts,
    questPoints: questPoints ?? 0,
    streakWeeks: weeklyGoal?.goal != null ? weeklyGoal.streakWeeks : 0,
  });
}

export function TrainingHero({ userId, standing, unit, today, trainedDates, hour }: TrainingHeroProps) {
  const headingId = useId();
  const pet = useCompanionPet(userId);
  const lastTrainedDate = useLastTrainedDate(userId, today, trainedDates);
  const recordDates = useRecordDates(userId);
  const loadout = useQuery(loadoutQuery(userId));
  const equipped = loadout.isSuccess ? (loadout.data?.slots ?? []) : null;
  const badgeColor = useQuery(profileQuery(userId)).data?.loaded.badgeColor ?? null;
  const levels = standing.status === 'ready' ? standing.standing : null;
  const skillLevels = levels && skillLevelsByKey(levels.skills);
  const scene = useScene(
    userId,
    levels &&
      skillLevels && { totalLevel: levels.totalLevel, skillLevels, recordCount: recordDates?.length ?? 0, hour },
  );
  const growthText = useSceneGrowth(userId, scene);

  return (
    <section className="panel training-hero" aria-labelledby={headingId}>
      <h2 id={headingId} className="visually-hidden">
        Your gym
      </h2>
      <div className="training-scene">
        <GymScene scene={scene} label={scene && sceneLabel(scene)} />
        {badgeColor !== null && equipped !== null && standing.status !== 'loading' && (
          <span className="scene-character">
            <CharacterLink
              slots={equipped}
              badgeColor={badgeColor}
              skillLevels={skillLevels}
              pose={characterPoseFrom(today, lastTrainedDate, recordDates)}
            />
          </span>
        )}
        {pet && (
          <span className="scene-pet">
            <PetCompanion pet={pet} mood={petMoodFrom(today, lastTrainedDate)} />
          </span>
        )}
        <QuestScrollLink userId={userId} unit={unit} />
        <LootChestLink userId={userId} />
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
