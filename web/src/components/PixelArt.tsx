import { monogramFor } from '../lib/standing.ts';
import {
  isSkillKey,
  type ItemIconKind,
  itemSprite,
  LEVEL_UP,
  LOGO,
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

export function LogoMark({ size = 48 }: { size?: number }) {
  return <PixelGrid sprite={LOGO} size={size} />;
}

export function TrophyIcon({ size = 36 }: { size?: number }) {
  return <PixelGrid sprite={TROPHY} size={size} />;
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

export function LevelUpIcon({ size = 24 }: { size?: number }) {
  return <PixelGrid sprite={LEVEL_UP} size={size} />;
}
