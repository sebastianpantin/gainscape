import { type CSSProperties } from 'react';
import { CharacterFigure, ItemIcon } from '../../components/PixelArt.tsx';
import {
  characterLabel,
  characterLook,
  gearLandingTop,
  type SkillLevels,
} from '../../lib/collection/character-rules.ts';
import { type EquippedGear } from '../../lib/collection/gear-rules.ts';
import { type CatalogItem, colorFor } from '../../lib/collection/item-rules.ts';
import { type BadgeColor } from '../../lib/profile/profile-rules.ts';

const TRY_ON_CHARACTER_SIZE = 128;
const DROPPED_ICON_SIZE = 32;

interface GearTryOnProps {
  slots: readonly EquippedGear[];
  badgeColor: BadgeColor;
  skillLevels: SkillLevels | null;
  putOn: CatalogItem | null;
}

export function GearTryOn({ slots, badgeColor, skillLevels, putOn }: GearTryOnProps) {
  const landingSlot = putOn?.gearSlot ?? null;
  return (
    <div className={landingSlot ? 'gear-try-on putting-on' : 'gear-try-on'}>
      <CharacterFigure
        look={characterLook(slots, badgeColor, skillLevels)}
        label={characterLabel(slots)}
        size={TRY_ON_CHARACTER_SIZE}
      />
      {putOn && landingSlot && (
        <span
          className="gear-drop"
          aria-hidden="true"
          style={{ '--gear-landing': gearLandingTop(landingSlot) } as CSSProperties}
        >
          <ItemIcon kind={putOn.icon} color={colorFor(putOn)} size={DROPPED_ICON_SIZE} />
        </span>
      )}
    </div>
  );
}
