import { useQuery } from '@tanstack/react-query';
import { CharacterFigure } from '../../components/PixelArt.tsx';
import { characterLabel, characterLook } from '../../lib/collection/character-rules.ts';
import { type BadgeColor } from '../../lib/profile/profile-rules.ts';
import { loadoutQuery } from '../../lib/query/queries.ts';

const PROFILE_CHARACTER_SIZE = 96;

export function ProfileCharacter({ userId, badgeColor }: { userId: string; badgeColor: BadgeColor }) {
  const loadout = useQuery(loadoutQuery(userId));
  if (!loadout.isSuccess) return <span className="profile-character" aria-hidden="true" />;
  const slots = loadout.data?.slots ?? null;
  return (
    <span className="profile-character">
      <CharacterFigure
        look={characterLook(slots ?? [], badgeColor)}
        label={characterLabel(slots)}
        size={PROFILE_CHARACTER_SIZE}
      />
    </span>
  );
}
