import { useEffect, useState } from 'react';
import { deviceStorage } from '../../lib/platform/keyed-store.ts';
import { type SceneStage, sceneGrowthText, sceneStageIndex } from '../../lib/progress/scene-rules.ts';
import { readLastSeenNumber, SCENE_STAGE_METRIC, saveLastSeenNumber } from '../../lib/ui/last-seen-number-store.ts';

interface SeenStage {
  userId: string;
  stage: SceneStage;
  growthText: string | null;
}

export function useSceneGrowth(userId: string, stage: SceneStage | null): string | null {
  const [seen, setSeen] = useState<SeenStage | null>(null);
  let current = seen;
  if (stage !== null && (current?.userId !== userId || current.stage !== stage)) {
    const lastSeen = readLastSeenNumber(deviceStorage(), userId, SCENE_STAGE_METRIC);
    current = { userId, stage, growthText: sceneGrowthText(lastSeen, stage) };
    setSeen(current);
  }

  useEffect(() => {
    if (current)
      saveLastSeenNumber(deviceStorage(), current.userId, SCENE_STAGE_METRIC, sceneStageIndex(current.stage));
  }, [current]);

  return current?.growthText ?? null;
}
