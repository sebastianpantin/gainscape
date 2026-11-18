import { useEffect, useState } from 'react';
import { deviceStorage } from '../../lib/platform/keyed-store.ts';
import {
  equipmentMask,
  type Scene,
  sceneGrowthText,
  type SceneSeen,
  sceneStageIndex,
} from '../../lib/progress/scene-rules.ts';
import {
  readLastSeenNumber,
  saveLastSeenNumber,
  SCENE_EQUIPMENT_METRIC,
  SCENE_STAGE_METRIC,
} from '../../lib/ui/last-seen-number-store.ts';

interface ShownScene {
  userId: string;
  stageIndex: number;
  equipmentMask: number;
  growthText: string | null;
}

function lastSeenScene(userId: string): SceneSeen | null {
  const stageIndex = readLastSeenNumber(deviceStorage(), userId, SCENE_STAGE_METRIC);
  if (stageIndex === null) return null;
  return { stageIndex, equipmentMask: readLastSeenNumber(deviceStorage(), userId, SCENE_EQUIPMENT_METRIC) };
}

export function useSceneGrowth(userId: string, scene: Scene | null): string | null {
  const [seen, setSeen] = useState<ShownScene | null>(null);
  let current = seen;
  if (scene !== null) {
    const stageIndex = sceneStageIndex(scene.stage);
    const mask = equipmentMask(scene.equipment);
    if (current?.userId !== userId || current.stageIndex !== stageIndex || current.equipmentMask !== mask) {
      current = {
        userId,
        stageIndex,
        equipmentMask: mask,
        growthText: sceneGrowthText(lastSeenScene(userId), scene),
      };
      setSeen(current);
    }
  }

  useEffect(() => {
    if (!current) return;
    saveLastSeenNumber(deviceStorage(), current.userId, SCENE_STAGE_METRIC, current.stageIndex);
    saveLastSeenNumber(deviceStorage(), current.userId, SCENE_EQUIPMENT_METRIC, current.equipmentMask);
  }, [current]);

  return current?.growthText ?? null;
}
