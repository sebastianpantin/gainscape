import { levelProgress } from '@domain/index.ts';
import { useQuery } from '@tanstack/react-query';
import { useId } from 'react';
import { Link } from 'react-router-dom';
import { CharacterFigure } from '../../components/PixelArt.tsx';
import { ProgressBar } from '../../components/ProgressBar.tsx';
import { characterLabel, characterLinkLabel, characterLook } from '../../lib/collection/character-rules.ts';
import { type EquippedGear } from '../../lib/collection/gear-rules.ts';
import { type BadgeColor } from '../../lib/profile/profile-rules.ts';
import { type UnitPref } from '../../lib/profile/profile.ts';
import { type StandingState } from '../../lib/progress/standing.ts';
import { loadoutQuery, profileQuery, questsQuery } from '../../lib/query/queries.ts';
import { activeQuestLine } from '../../lib/quests/quest-rules.ts';
import { skillXpMetric } from '../../lib/ui/last-seen-number-store.ts';
import { useCountUp } from '../../lib/ui/use-count-up.ts';
import { PetCompanion } from './PetCompanion.tsx';
import { useCompanionPet } from './use-companion-pet.ts';
import { usePetMood } from './use-pet-mood.ts';
import { type NearestLevelUp, nearestLevelUp, nearestLevelUpText, nearestLevelUpValueText } from './today-rules.ts';

const HERO_CHARACTER_SIZE = 96;

function CharacterLink({ slots, badgeColor }: { slots: readonly EquippedGear[]; badgeColor: BadgeColor }) {
  return (
    <Link className="hero-character-link" to="/collection/items" aria-label={characterLinkLabel(slots)}>
      <CharacterFigure
        look={characterLook(slots, badgeColor)}
        label={characterLabel(slots)}
        size={HERO_CHARACTER_SIZE}
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
}

export function TrainingHero({ userId, standing, today, trainedDates }: TrainingHeroProps) {
  const headingId = useId();
  const pet = useCompanionPet(userId);
  const mood = usePetMood(userId, today, trainedDates);
  const loadout = useQuery(loadoutQuery(userId));
  const equipped = loadout.isSuccess ? (loadout.data?.slots ?? []) : null;
  const badgeColor = useQuery(profileQuery(userId)).data?.loaded.badgeColor ?? null;
  const levelUp = standing.status === 'ready' ? nearestLevelUp(standing.standing.skills) : null;
  const hasCharacter = badgeColor !== null || pet !== null;

  if (!hasCharacter && !levelUp) return null;
  return (
    <section className="panel training-hero" aria-labelledby={headingId}>
      <h2 id={headingId} className="visually-hidden">
        Your progress
      </h2>
      {hasCharacter && (
        <div className="hero-character">
          {badgeColor !== null && equipped !== null && <CharacterLink slots={equipped} badgeColor={badgeColor} />}
          {badgeColor !== null && loadout.isPending && (
            <span className="hero-character-placeholder" aria-hidden="true" />
          )}
          {pet && <PetCompanion pet={pet} mood={mood} />}
        </div>
      )}
      {levelUp && (
        <div className="hero-progress">
          <LevelUpBar userId={userId} levelUp={levelUp} />
        </div>
      )}
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
