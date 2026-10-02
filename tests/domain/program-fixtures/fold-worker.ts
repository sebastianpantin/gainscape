import { parentPort, workerData } from 'node:worker_threads';
import {
  type ProgramDefinition,
  type ProgramEnrollment,
  type ProgramFact,
  programStateAt,
} from '../../../supabase/functions/_shared/domain/index.ts';

const { definition, enrollment, facts } = workerData as {
  definition: ProgramDefinition;
  enrollment: ProgramEnrollment;
  facts: ProgramFact[];
};

parentPort?.postMessage(programStateAt(definition, enrollment, facts));
