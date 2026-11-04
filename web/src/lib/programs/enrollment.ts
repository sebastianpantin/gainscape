import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { isDeviceOffline, loadCacheFirstWhenOffline } from '../../offline/cache-first.ts';
import {
  type EnrollmentIo,
  type EnrollmentServer,
  forgetStoredEnrollment,
  forgetStoredSession,
  refreshEnrollment,
  refreshEnrollmentFacts,
  type StoredEnrollment,
  storedEnrollment,
  storeTemplates,
  watchStoredEnrollment,
} from '../../offline/enrollment-store.ts';
import { fetchExercises } from '../exercises/catalog.ts';
import { readCachedExercises } from '../exercises/catalog-cache.ts';
import { activeExercises, type Exercise } from '../exercises/catalog-rules.ts';
import { deviceStorage } from '../platform/keyed-store.ts';
import { supabase } from '../platform/supabase.ts';
import { useOnlineSignal } from '../platform/use-online.ts';
import { parsedRow, parsedRows } from '../rows.ts';
import {
  type EnrollProgramPayload,
  PROGRAM_TEMPLATE_COLUMNS,
  type ProgramTemplateRow,
  programTemplateRowSchema,
} from './program-enroll-rules.ts';
import {
  ENROLLMENT_COLUMNS,
  type EnrollmentFactsRows,
  enrollmentFactsRowsSchema,
  type EnrollmentRow,
  enrollmentRowSchema,
} from './program-facts-rules.ts';
import { type SetReferenceEvent } from './program-reference-rules.ts';
import {
  type ActiveProgram,
  activeProgram,
  offlineRefreshState,
  programLoadStatus,
  type ProgramRefreshState,
  programStatusText,
  type SkipDayEvent,
} from './program-today-rules.ts';

export type EnrollmentAdjustment = SetReferenceEvent | SkipDayEvent;

export interface SavedEnrollment extends StoredEnrollment {
  program: ActiveProgram;
}

export interface EnrollChoices {
  templates: ProgramTemplateRow[];
  exercises: Exercise[];
}

async function fetchProgramTemplates(): Promise<ProgramTemplateRow[]> {
  const { data, error } = await supabase.from('program_templates').select(PROGRAM_TEMPLATE_COLUMNS);
  if (error) throw error;
  return parsedRows(programTemplateRowSchema, data);
}

async function fetchActiveEnrollment(): Promise<EnrollmentRow | null> {
  const { data, error } = await supabase
    .from('program_enrollments')
    .select(ENROLLMENT_COLUMNS)
    .is('ended_at', null)
    .maybeSingle();
  if (error) throw error;
  return data === null ? null : parsedRow(enrollmentRowSchema, data);
}

async function fetchEnrollmentFacts(enrollmentId: string): Promise<EnrollmentFactsRows> {
  const { data, error } = await supabase.rpc('enrollment_facts', { enrollment_id: enrollmentId });
  if (error) throw error;
  return parsedRow(enrollmentFactsRowsSchema, data);
}

async function enrollProgram(payload: EnrollProgramPayload): Promise<string> {
  const { data, error } = await supabase.rpc('enroll_program', { enrollment: payload });
  if (error) throw error;
  return parsedRow(z.string(), data);
}

async function endEnrollment(enrollmentId: string): Promise<void> {
  const { error } = await supabase.rpc('end_enrollment', { enrollment_id: enrollmentId });
  if (error) throw error;
}

async function adjustEnrollment(enrollmentId: string, adjustment: EnrollmentAdjustment): Promise<void> {
  const { error } = await supabase.rpc('adjust_enrollment', { enrollment_id: enrollmentId, event: adjustment });
  if (error) throw error;
}

const SERVER: EnrollmentServer = {
  templates: fetchProgramTemplates,
  activeEnrollment: fetchActiveEnrollment,
  enrollmentFacts: fetchEnrollmentFacts,
};

function deviceIo(): EnrollmentIo {
  return { device: deviceStorage(), server: SERVER, now: Date.now };
}

function withProgram(stored: StoredEnrollment): SavedEnrollment {
  return { ...stored, program: activeProgram(stored.templates, stored.enrollment, stored.facts) };
}

export function savedEnrollment(userId: string): SavedEnrollment {
  return withProgram(storedEnrollment(deviceStorage(), userId));
}

async function fetchAndSaveProgramTemplates(userId: string): Promise<ProgramTemplateRow[]> {
  const templates = await fetchProgramTemplates();
  storeTemplates(deviceStorage(), userId, templates);
  return templates;
}

function savedProgramTemplates(userId: string): ProgramTemplateRow[] | null {
  const saved = storedEnrollment(deviceStorage(), userId).templates;
  return saved.length > 0 ? saved : null;
}

export async function loadProgramTemplatesCacheFirst(userId: string): Promise<ProgramTemplateRow[]> {
  const load = await loadCacheFirstWhenOffline(
    isDeviceOffline,
    () => savedProgramTemplates(userId),
    () => fetchAndSaveProgramTemplates(userId),
  );
  return load.loaded;
}

function savedEnrollChoices(userId: string): EnrollChoices | null {
  const templates = savedProgramTemplates(userId);
  const storage = deviceStorage();
  const exercises = storage && readCachedExercises(storage, userId);
  return templates && exercises ? { templates, exercises: activeExercises(exercises) } : null;
}

export async function loadEnrollChoicesCacheFirst(userId: string): Promise<EnrollChoices> {
  const load = await loadCacheFirstWhenOffline(
    isDeviceOffline,
    () => savedEnrollChoices(userId),
    async () => {
      const [templates, exercises] = await Promise.all([
        fetchAndSaveProgramTemplates(userId),
        fetchExercises({ includeArchived: false }),
      ]);
      return { templates, exercises };
    },
  );
  return load.loaded;
}

export async function enroll(userId: string, payload: EnrollProgramPayload): Promise<void> {
  await enrollProgram(payload);
  forgetEnrollment(userId);
}

export function forgetEnrollment(userId: string): void {
  forgetStoredEnrollment(deviceStorage(), userId);
}

export function forgetDeletedProgramSession(userId: string, sessionId: string): void {
  forgetStoredSession(deviceStorage(), userId, sessionId);
}

export function useActiveProgram(userId: string) {
  const [stored, setStored] = useState(() => storedEnrollment(deviceStorage(), userId));
  const [refresh, setRefresh] = useState<ProgramRefreshState>(() =>
    isDeviceOffline() ? offlineRefreshState(stored) : 'pending',
  );
  const onlineSignal = useOnlineSignal();

  useEffect(
    () => watchStoredEnrollment((changedUserId, changed) => changedUserId === userId && setStored(changed)),
    [userId],
  );

  useEffect(() => {
    if (isDeviceOffline()) return;
    let active = true;
    refreshEnrollment(deviceIo(), userId).then(
      () => active && setRefresh('done'),
      () => active && setRefresh('failed'),
    );
    return () => {
      active = false;
    };
  }, [userId, onlineSignal]);

  const saved = useMemo(() => withProgram(stored), [stored]);
  const loadStatus = programLoadStatus({ hasCachedEnrollment: stored.enrollment !== null, refresh });

  const adjust = async (adjustments: readonly EnrollmentAdjustment[]) => {
    const { enrollment } = stored;
    if (!enrollment) return;
    try {
      for (const adjustment of adjustments) await adjustEnrollment(enrollment.id, adjustment);
    } finally {
      await refreshEnrollmentFacts(deviceIo(), userId, enrollment).catch(() => null);
    }
  };

  const stop = async () => {
    if (!stored.enrollment) return;
    await endEnrollment(stored.enrollment.id);
    forgetEnrollment(userId);
  };

  return { ...saved, loadStatus, statusText: programStatusText(loadStatus), adjust, stop };
}
