import { useQuery } from '@tanstack/react-query';
import { CharacterFigure } from '../../components/PixelArt.tsx';
import { characterLabel, characterLook, type SkillLevels } from '../../lib/collection/character-rules.ts';
import { type BadgeColor } from '../../lib/profile/profile-rules.ts';
import { loadoutQuery } from '../../lib/query/queries.ts';

const PROFILE_CHARACTER_SIZE = 96;

interface ProfileCharacterProps {
  userId: string;
  badgeColor: BadgeColor;
  skillLevels: SkillLevels | null;
}

export function ProfileCharacter({ userId, badgeColor, skillLevels }: ProfileCharacterProps) {
  const loadout = useQuery(loadoutQuery(userId));
  if (loadout.isError) return null;
  if (!loadout.isSuccess) return <span className="profile-character" aria-hidden="true" />;
  const slots = loadout.data?.slots ?? null;
  return (
    <span className="profile-character">
      <CharacterFigure
        look={characterLook(slots ?? [], badgeColor, skillLevels)}
        label={characterLabel(slots)}
        size={PROFILE_CHARACTER_SIZE}
      />
    </span>
  );
}
