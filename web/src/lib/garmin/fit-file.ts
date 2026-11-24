import type { GarminActivity } from '@domain/index.ts';
import { garminActivitiesFromFit } from './fit-activity-rules.ts';

export async function fitActivitiesOf(content: ArrayBuffer): Promise<GarminActivity[]> {
  const { default: FitParser } = await import('fit-file-parser');
  try {
    return garminActivitiesFromFit(await new FitParser({ force: false }).parseAsync(content));
  } catch {
    return [];
  }
}
