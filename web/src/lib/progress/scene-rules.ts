import { formatCount } from '../format.ts';

export const SCENE_STAGES = ['bare', 'plates', 'banners', 'window', 'skyline'] as const;
export type SceneStage = (typeof SCENE_STAGES)[number];
export type SceneProp = 'rack' | 'wall-plates' | 'banner' | 'window' | 'skyline';
export type SceneLight = 'dawn' | 'day' | 'dusk' | 'night';
export const SCENE_EQUIPMENT = [
  'bench',
  'climbing-rope',
  'medicine-ball',
  'dumbbells',
  'bar-plates',
  'kettlebell',
  'chalk-bowl',
  'jump-rope',
  'cones',
  'mat',
] as const;
export type SceneEquipment = (typeof SCENE_EQUIPMENT)[number];
export const TORCH_FLAMES = ['small', 'steady', 'roaring'] as const;
export type TorchFlame = (typeof TORCH_FLAMES)[number];

export interface SceneTorch {
  streakWeeks: number;
  flame: TorchFlame;
}

export const EQUIPMENT_MIN_SKILL_LEVEL = 20;
export const MAX_EQUIPMENT_NAMED = 3;
export const MAX_SCENE_TROPHIES = 3;
export const MAX_SCENE_PENNANTS = 3;

export const SCENE_STAGE_MIN_TOTAL_LEVEL: Record<SceneStage, number> = {
  bare: 0,
  plates: 15,
  banners: 40,
  window: 100,
  skyline: 300,
};

const PROP_ADDED_BY_STAGE: Record<SceneStage, SceneProp> = {
  bare: 'rack',
  plates: 'wall-plates',
  banners: 'banner',
  window: 'window',
  skyline: 'skyline',
};

export const EQUIPMENT_SKILL: Record<SceneEquipment, string> = {
  bench: 'chest',
  'climbing-rope': 'back',
  'medicine-ball': 'shoulders',
  dumbbells: 'arms',
  'bar-plates': 'legs',
  kettlebell: 'core',
  'chalk-bowl': 'grip',
  'jump-rope': 'endurance',
  cones: 'agility',
  mat: 'mobility',
};

const EQUIPMENT_PHRASE: Record<SceneEquipment, string> = {
  bench: 'a bench',
  'climbing-rope': 'a climbing rope',
  'medicine-ball': 'a medicine ball',
  dumbbells: 'dumbbells',
  'bar-plates': 'more plates on the bar',
  kettlebell: 'a kettlebell',
  'chalk-bowl': 'a chalk bowl',
  'jump-rope': 'a jump rope',
  cones: 'cones',
  mat: 'a mat',
};

const GROWTH_TEXT: Record<Exclude<SceneStage, 'bare'>, string> = {
  plates: 'plates on the wall',
  banners: 'a banner went up',
  window: 'a window let the light in',
  skyline: 'the city came into view',
};

const PROP_PHRASE: Record<Exclude<SceneProp, 'skyline'>, string> = {
  rack: 'a rack',
  'wall-plates': 'plates on the wall',
  banner: 'a banner',
  window: 'a window',
};

const LIGHT_PHRASE: Record<SceneLight, string> = {
  dawn: 'at dawn',
  day: 'in daylight',
  dusk: 'at dusk',
  night: 'at night',
};

export const TORCH_FLAME_MIN_STREAK_WEEKS: Record<TorchFlame, number> = { small: 1, steady: 4, roaring: 12 };

const PENNANT_QUEST_POINTS = [1, 5, 15] as const;
const HOURS_IN_DAY = 24;
const DAWN_FROM_HOUR = 5;
const DAY_FROM_HOUR = 8;
const DUSK_FROM_HOUR = 18;
const NIGHT_FROM_HOUR = 21;

const PHRASE_LIST = new Intl.ListFormat('en-GB', { type: 'conjunction' });

export interface SceneInput {
  totalLevel: number;
  recordCount: number;
  questPoints: number;
  streakWeeks: number;
  skillLevels: Readonly<Record<string, number>>;
  hour: number;
}

export interface Scene {
  stage: SceneStage;
  props: readonly SceneProp[];
  equipment: readonly SceneEquipment[];
  trophies: number;
  pennants: number;
  torch: SceneTorch | null;
  light: SceneLight;
}

export function sceneStageIndex(stage: SceneStage): number {
  return SCENE_STAGES.indexOf(stage);
}

function stageFor(totalLevel: number): SceneStage {
  return SCENE_STAGES.reduce<SceneStage>(
    (reached, stage) => (totalLevel >= SCENE_STAGE_MIN_TOTAL_LEVEL[stage] ? stage : reached),
    'bare',
  );
}

export function sceneLightFor(hour: number): SceneLight {
  const dayHour = ((hour % HOURS_IN_DAY) + HOURS_IN_DAY) % HOURS_IN_DAY;
  if (dayHour >= NIGHT_FROM_HOUR || dayHour < DAWN_FROM_HOUR) return 'night';
  if (dayHour < DAY_FROM_HOUR) return 'dawn';
  if (dayHour < DUSK_FROM_HOUR) return 'day';
  return 'dusk';
}

function torchFor(streakWeeks: number): SceneTorch | null {
  if (streakWeeks < TORCH_FLAME_MIN_STREAK_WEEKS.small) return null;
  const flame = TORCH_FLAMES.reduce<TorchFlame>(
    (reached, size) => (streakWeeks >= TORCH_FLAME_MIN_STREAK_WEEKS[size] ? size : reached),
    'small',
  );
  return { streakWeeks, flame };
}

export function sceneFor(input: SceneInput): Scene {
  const { totalLevel, recordCount, questPoints, streakWeeks, skillLevels, hour } = input;
  const stage = stageFor(totalLevel);
  return {
    stage,
    props: SCENE_STAGES.slice(0, sceneStageIndex(stage) + 1).map((reached) => PROP_ADDED_BY_STAGE[reached]),
    equipment: SCENE_EQUIPMENT.filter(
      (equipment) => (skillLevels[EQUIPMENT_SKILL[equipment]] ?? 0) >= EQUIPMENT_MIN_SKILL_LEVEL,
    ),
    trophies: Math.min(Math.max(recordCount, 0), MAX_SCENE_TROPHIES),
    pennants: Math.min(PENNANT_QUEST_POINTS.filter((points) => questPoints >= points).length, MAX_SCENE_PENNANTS),
    torch: torchFor(streakWeeks),
    light: sceneLightFor(hour),
  };
}

export interface SceneSeen {
  stageIndex: number;
  equipmentMask: number | null;
}

export function equipmentMask(equipment: readonly SceneEquipment[]): number {
  return equipment.reduce((mask, piece) => mask | (1 << SCENE_EQUIPMENT.indexOf(piece)), 0);
}

function arrivalsText(seenMask: number | null, equipment: readonly SceneEquipment[]): string | null {
  if (seenMask === null) return null;
  const arrived = equipment.filter((piece) => (seenMask & equipmentMask([piece])) === 0);
  if (arrived.length === 0) return null;
  if (arrived.length > MAX_EQUIPMENT_NAMED) return `${arrived.length} pieces of equipment arrived`;
  return `${PHRASE_LIST.format(arrived.map((piece) => EQUIPMENT_PHRASE[piece]))} arrived`;
}

function stageGrowthText(seenStageIndex: number, stage: SceneStage): string | null {
  return stage === 'bare' || sceneStageIndex(stage) <= seenStageIndex ? null : GROWTH_TEXT[stage];
}

export function sceneGrowthText(seen: SceneSeen | null, scene: Pick<Scene, 'stage' | 'equipment'>): string | null {
  if (seen === null) return null;
  const grown = [
    stageGrowthText(seen.stageIndex, scene.stage),
    arrivalsText(seen.equipmentMask, scene.equipment),
  ].filter((text) => text !== null);
  return grown.length === 0 ? null : `Your gym grew: ${PHRASE_LIST.format(grown)}`;
}

function equipmentPhrases(equipment: readonly SceneEquipment[]): string[] {
  if (equipment.length > MAX_EQUIPMENT_NAMED) return [`${equipment.length} pieces of equipment`];
  return equipment.map((piece) => EQUIPMENT_PHRASE[piece]);
}

function propPhrases(props: readonly SceneProp[]): string[] {
  const seesCity = props.includes('skyline');
  return props.flatMap((prop) => {
    if (prop === 'skyline') return [];
    if (prop === 'window' && seesCity) return ['a window onto the city'];
    return [PROP_PHRASE[prop]];
  });
}

function trophiesText(count: number): string {
  return count === 1 ? '1 trophy' : `${count} trophies`;
}

export function sceneLabel(scene: Scene): string {
  const light = LIGHT_PHRASE[scene.light];
  const extras = [
    ...equipmentPhrases(scene.equipment),
    ...(scene.trophies > 0 ? [trophiesText(scene.trophies)] : []),
    ...(scene.pennants > 0 ? [formatCount(scene.pennants, 'quest pennant')] : []),
    ...(scene.torch ? [`a torch lit for a ${scene.torch.streakWeeks} week streak`] : []),
  ];
  if (scene.stage === 'bare' && extras.length === 0) return `Your gym: a bare room with a rack, ${light}`;
  return `Your gym: ${PHRASE_LIST.format([...propPhrases(scene.props), ...extras])}, ${light}`;
}
