import { PAIN_BOUNDS } from '@domain/types.ts';

interface PainAction {
  label: string;
  accessibleName: string;
  onChoose: () => void;
}

export function painLabel(pain: number | null | undefined): string | null {
  return pain == null ? null : `pain ${pain}/${PAIN_BOUNDS.max}`;
}

export function painActions(
  pain: number | null | undefined,
  rowName: string,
  onChange: (pain: number | null) => void,
): PainAction[] {
  if (pain == null) {
    return [{ label: 'Log pain', accessibleName: `Log pain, ${rowName}`, onChoose: () => onChange(PAIN_BOUNDS.min) }];
  }
  return [{ label: 'Clear pain', accessibleName: `Clear pain, ${rowName}`, onChoose: () => onChange(null) }];
}
