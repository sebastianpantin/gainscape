import { useQuery } from '@tanstack/react-query';
import { useId } from 'react';
import { Link } from 'react-router-dom';
import { ItemIcon } from '../../components/PixelArt.tsx';
import { ProgressBar } from '../../components/ProgressBar.tsx';
import { type EquippedGear, equippedGearLabel } from '../../lib/collection/gear-rules.ts';
import { colorFor } from '../../lib/collection/item-rules.ts';
import { type UnitPref } from '../../lib/profile/profile.ts';
import { type StandingState } from '../../lib/progress/standing.ts';
import { loadoutQuery, questsQuery } from '../../lib/query/queries.ts';
import { activeQuestLine } from '../../lib/quests/quest-rules.ts';
import { PetCompanion } from './PetCompanion.tsx';
import { useCompanionPet } from './use-companion-pet.ts';
import { nearestLevelUp, nearestLevelUpText, nearestLevelUpValueText } from './today-rules.ts';

const GEAR_ICON_SIZE = 28;

function EquippedGearLink({ slots }: { slots: readonly EquippedGear[] }) {
  return (
    <Link className="hero-gear" to="/collection/items" aria-label={equippedGearLabel(slots)}>
      {slots.map((gear) => (
        <ItemIcon key={gear.slot} kind={gear.slot} color={colorFor(gear)} size={GEAR_ICON_SIZE} />
      ))}
    </Link>
  );
}

interface TrainingHeroProps {
  userId: string;
  standing: StandingState;
  unit: UnitPref;
}

export function TrainingHero({ userId, standing, unit }: TrainingHeroProps) {
  const headingId = useId();
  const pet = useCompanionPet(userId);
  const equipped = useQuery(loadoutQuery(userId)).data?.slots ?? [];
  const questLog = useQuery(questsQuery(userId)).data?.loaded;
  const quest = questLog ? activeQuestLine(questLog, unit) : null;
  const levelUp = standing.status === 'ready' ? nearestLevelUp(standing.standing.skills) : null;
  const hasCharacter = pet !== null || equipped.length > 0;

  if (!hasCharacter && !levelUp && !quest) return null;
  return (
    <section className="panel training-hero" aria-labelledby={headingId}>
      <h2 id={headingId} className="visually-hidden">
        Your progress
      </h2>
      {hasCharacter && (
        <div className="hero-character">
          {pet && <PetCompanion pet={pet} />}
          {equipped.length > 0 && <EquippedGearLink slots={equipped} />}
        </div>
      )}
      <div className="stack hero-progress">
        {levelUp && (
          <div className="stack hero-bar">
            <Link className="tap-link" to="/skills">
              {nearestLevelUpText(levelUp)}
            </Link>
            <ProgressBar
              fraction={levelUp.xpIntoLevel / levelUp.levelXp}
              label={`${levelUp.skillName} XP to level ${levelUp.nextLevel}`}
              valueText={nearestLevelUpValueText(levelUp)}
            />
            <span className="muted tiny" aria-hidden="true">
              {nearestLevelUpValueText(levelUp)}
            </span>
          </div>
        )}
        {quest && (
          <div className="stack hero-bar">
            <Link className="tap-link" to="/skills/quests">
              {quest.questName}
            </Link>
            <span className="muted tiny">{quest.stepText}</span>
            <ProgressBar
              fraction={quest.fraction}
              label={`${quest.questName} progress`}
              valueText={quest.progressText}
            />
            <span className="muted tiny" aria-hidden="true">
              {quest.progressText}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
