import { monogramFor } from '../lib/progress/standing-rules.ts';
import { type CharacterLook, characterFrames } from './character-sprites.ts';
import {
  isSkillKey,
  type ItemIconKind,
  itemSprite,
  LEVEL_UP,
  LOGO,
  LOOT_CHEST,
  LOOT_CHEST_OPEN,
  SKILL_SPRITES,
  type Sprite,
  TROPHY,
} from './pixel-sprites.ts';

function PixelGrid({ sprite, size }: { sprite: Sprite; size: number }) {
  const { pixels, cols, rows } = sprite;
  return (
    <svg
      width={size * (cols / rows)}
      height={size}
      viewBox={`0 0 ${cols} ${rows}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {pixels.map((pixel, index) => (
        <rect
          key={index}
          x={pixel.x}
          y={pixel.y}
          width={pixel.w}
          height={pixel.h}
          fill={pixel.fill}
          opacity={pixel.opacity}
        />
      ))}
    </svg>
  );
}

export function LogoMark() {
  return <PixelGrid sprite={LOGO} size={48} />;
}

export function TrophyIcon() {
  return <PixelGrid sprite={TROPHY} size={32} />;
}

export function ItemIcon({ kind, color, size = 36 }: { kind: ItemIconKind; color: string; size?: number }) {
  return <PixelGrid sprite={itemSprite(kind, color)} size={size} />;
}

export function SkillIcon({ skillKey, size = 32 }: { skillKey: string; size?: number }) {
  if (!isSkillKey(skillKey))
    return (
      <span className="monogram" aria-hidden="true">
        {monogramFor(skillKey)}
      </span>
    );
  return (
    <span className="skill-icon" aria-hidden="true">
      <PixelGrid sprite={SKILL_SPRITES[skillKey]} size={size} />
    </span>
  );
}

export function LevelUpIcon() {
  return <PixelGrid sprite={LEVEL_UP} size={24} />;
}

export function LootChestIcon() {
  return <PixelGrid sprite={LOOT_CHEST} size={56} />;
}

export function OpenLootChestIcon() {
  return <PixelGrid sprite={LOOT_CHEST_OPEN} size={56} />;
}

export function CharacterFigure({ look, label, size = 128 }: { look: CharacterLook; label: string; size?: number }) {
  const [still, bobbed] = characterFrames(look);
  return (
    <span className="character" role="img" aria-label={label}>
      <span className="character-frame still">
        <PixelGrid sprite={still} size={size} />
      </span>
      <span className="character-frame bobbed">
        <PixelGrid sprite={bobbed} size={size} />
      </span>
    </span>
  );
}
