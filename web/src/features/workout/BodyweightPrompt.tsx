import { type FormEvent, useState } from 'react';
import { bodyweightRangeInUnit, type UnitPref } from '../../lib/profile.ts';
import { unitToKg } from '../../lib/units.ts';
import { messageOf } from '../../lib/error-text.ts';

interface BodyweightPromptProps {
  unit: UnitPref;
  onSave: (bodyweightKg: number) => Promise<void>;
  submitLabel?: string;
}

export function BodyweightPrompt({ unit, onSave, submitLabel = 'Save and finish workout' }: BodyweightPromptProps) {
  const [bodyweight, setBodyweight] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { lowest, highest } = bodyweightRangeInUnit(unit);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setProblem(null);
    try {
      await onSave(unitToKg(Number(bodyweight), unit));
    } catch (error) {
      setProblem(messageOf(error, 'Could not save your bodyweight.'));
      setSaving(false);
    }
  }

  return (
    <form className="panel stack bodyweight-prompt" onSubmit={submit}>
      <p>Bodyweight exercises count your bodyweight as the load. It stays private.</p>
      <label className="field">
        Bodyweight ({unit})
        <input
          type="number"
          inputMode="decimal"
          min={lowest}
          max={highest}
          step={0.1}
          value={bodyweight}
          onChange={(event) => setBodyweight(event.target.value)}
          required
        />
      </label>
      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
      <button className="button primary" type="submit" disabled={saving}>
        {submitLabel}
      </button>
    </form>
  );
}
