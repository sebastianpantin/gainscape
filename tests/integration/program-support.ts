import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { type TestUser } from './local-stack.ts';

export interface PlannedExerciseDoc {
  exerciseId: string;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number;
  progression?: 'none' | 'fixed' | 'linear';
  incrementKg?: number | null;
  incrementLb?: number | null;
}

export interface ProgramDayDoc {
  id: string;
  name: string;
  exercises: PlannedExerciseDoc[];
}

export interface ProgramDoc {
  id: string;
  name: string;
  days: ProgramDayDoc[];
}

export interface PublishedTemplate {
  key: string;
  version: number;
}

export function plannedDay(name: string, exercises: PlannedExerciseDoc[]): ProgramDayDoc {
  return { id: randomUUID(), name, exercises };
}

export function linearFiveByFive(exerciseId: string, incrementKg = 2.5, incrementLb = 5): PlannedExerciseDoc {
  return {
    exerciseId,
    targetSets: 5,
    targetRepsMin: 5,
    targetRepsMax: 5,
    progression: 'linear',
    incrementKg,
    incrementLb,
  };
}

export async function savedProgram(user: TestUser, program: ProgramDoc): Promise<string> {
  const { data, error } = await user.client.rpc('save_program', { program });
  expect(error).toBeNull();
  return data as string;
}

export async function publishProgram(user: TestUser, programId: string) {
  return await user.client.rpc('publish_program', { program_id: programId });
}

export async function publishedProgram(user: TestUser, programId: string): Promise<PublishedTemplate> {
  const { data, error } = await publishProgram(user, programId);
  expect(error).toBeNull();
  return data as PublishedTemplate;
}

export function customTemplateKey(programId: string): string {
  return `custom_${programId.replaceAll('-', '')}`;
}

export function customLiftKey(exerciseId: string): string {
  return `x_${exerciseId.replaceAll('-', '')}`;
}
