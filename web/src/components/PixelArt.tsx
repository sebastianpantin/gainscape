import { type Scene } from '../lib/progress/scene-rules.ts';
import { monogramFor } from '../lib/progress/standing-rules.ts';
import { type CharacterLook, type CharacterPose, characterFrames } from './character-sprites.ts';
import {
  isSkillKey,
  type ItemIconKind,
  itemSprite,
  LEVEL_UP,
  LOGO,
  LOOT_CHEST,
  LOOT_CHEST_OPEN,
  QUEST_SCROLL,
  SKILL_SPRITES,
  type Sprite,
  TROPHY,
} from './pixel-sprites.ts';
import { sceneArt } from './scene-sprites.ts';

function PixelRects({ sprite }: { sprite: Sprite }) {
  return sprite.pixels.map((pixel, index) => (
    <rect
      key={index}
      x={pixel.x}
      y={pixel.y}
      width={pixel.w}
      height={pixel.h}
      fill={pixel.fill}
      opacity={pixel.opacity}
    />
  ));
}

function PixelGrid({ sprite, size }: { sprite: Sprite; size: number }) {
  const { cols, rows } = sprite;
  return (
    <svg
      width={size * (cols / rows)}
      height={size}
      viewBox={`0 0 ${cols} ${rows}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <PixelRects sprite={sprite} />
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

export function LootChestIcon({ size = 56 }: { size?: number }) {
  return <PixelGrid sprite={LOOT_CHEST} size={size} />;
}

export function QuestScrollIcon() {
  return <PixelGrid sprite={QUEST_SCROLL} size={24} />;
}

export function OpenLootChestIcon() {
  return <PixelGrid sprite={LOOT_CHEST_OPEN} size={56} />;
}

interface CharacterFigureProps {
  look: CharacterLook;
  label: string;
  pose?: CharacterPose;
  size?: number;
}

export function CharacterFigure({ look, label, pose = 'idle', size = 128 }: CharacterFigureProps) {
  const [still, bobbed] = characterFrames(look, pose);
  return (
    <span className={`character ${pose}`} role="img" aria-label={label}>
      <span className="character-frame still">
        <PixelGrid sprite={still} size={size} />
      </span>
      <span className="character-frame bobbed">
        <PixelGrid sprite={bobbed} size={size} />
      </span>
    </span>
  );
}

function SceneLayer({ sprite, className }: { sprite: Sprite; className: string }) {
  return (
    <svg
      className={className}
      viewBox={`0 0 ${sprite.cols} ${sprite.rows}`}
      preserveAspectRatio="xMidYMax slice"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <PixelRects sprite={sprite} />
    </svg>
  );
}

export function GymScene({ scene, label }: { scene: Scene | null; label: string | null }) {
  const { still, frames } = sceneArt(scene);
  if (label === null) return <SceneLayer sprite={still} className="scene-art" />;
  const moves = frames.some((frame) => frame.pixels.length > 0);
  return (
    <span className="scene-art-label" role="img" aria-label={label}>
      <SceneLayer sprite={still} className="scene-art" />
      {moves && <SceneLayer sprite={frames[0]} className="scene-frame" />}
      {moves && <SceneLayer sprite={frames[1]} className="scene-frame second" />}
    </span>
  );
}
