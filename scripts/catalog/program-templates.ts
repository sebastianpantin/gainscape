import { join } from 'node:path';
import { type ProgramDefinition } from '../../supabase/functions/_shared/domain/program-definition.ts';

export const PROGRAM_TEMPLATES_DIR = join(import.meta.dirname, '../../catalog/program-templates');

export interface ProgramTemplateSource {
  file: string;
  raw: unknown;
}

export interface ProgramTemplate {
  file: string;
  definition: ProgramDefinition;
}

export class ProgramTemplateShapeError extends Error {
  readonly file: string;
  readonly issues: string[];

  constructor(file: string, issues: string[]) {
    super(issues.map((issue) => `${file}: ${issue}`).join('\n'));
    this.name = 'ProgramTemplateShapeError';
    this.file = file;
    this.issues = issues;
  }
}

function notImplemented(): never {
  throw new Error('not implemented');
}

export function readProgramTemplateSources(dir: string = PROGRAM_TEMPLATES_DIR): ProgramTemplateSource[] {
  void dir;
  return notImplemented();
}

export function parseProgramTemplate(source: ProgramTemplateSource): ProgramTemplate {
  void source;
  return notImplemented();
}

export function programTemplateProblems(template: ProgramTemplate): string[] {
  void template;
  return notImplemented();
}

export function loadProgramTemplates(dir: string = PROGRAM_TEMPLATES_DIR): ProgramTemplate[] {
  void dir;
  return notImplemented();
}

export function kgFromLb(lb: number): number {
  void lb;
  return notImplemented();
}

export function renderProgramTemplates(templates: readonly ProgramTemplate[]): string {
  void templates;
  return notImplemented();
}
