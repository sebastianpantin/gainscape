import { monogramFor } from '../lib/standing-rules.ts';
import {
  isSkillKey,
  type ItemIconKind,
  itemSprite,
  LEVEL_UP,
  LOGO,
  LOOT_CHEST,
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

export function ItemIcon({ kind, color }: { kind: ItemIconKind; color: string }) {
  return <PixelGrid sprite={itemSprite(kind, color)} size={36} />;
}

export function SkillIcon({ skillKey }: { skillKey: string }) {
  if (!isSkillKey(skillKey))
    return (
      <span className="monogram" aria-hidden="true">
        {monogramFor(skillKey)}
      </span>
    );
  return (
    <span className="skill-icon" aria-hidden="true">
      <PixelGrid sprite={SKILL_SPRITES[skillKey]} size={32} />
    </span>
  );
}

export function LevelUpIcon() {
  return <PixelGrid sprite={LEVEL_UP} size={24} />;
}

export function LootChestIcon() {
  return <PixelGrid sprite={LOOT_CHEST} size={56} />;
}
