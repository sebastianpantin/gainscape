import { type FormEvent, useState } from 'react';
import { parsedBodyweightKg, type UnitPref } from '../../lib/profile/profile.ts';
import { messageOf } from '../../lib/error-text.ts';
import { DecimalInput } from '../../components/DecimalInput.tsx';

interface BodyweightPromptProps {
  unit: UnitPref;
  onSave: (bodyweightKg: number) => Promise<void>;
  submitLabel?: string;
}

export function BodyweightPrompt({ unit, onSave, submitLabel = 'Save and finish workout' }: BodyweightPromptProps) {
  const [bodyweight, setBodyweight] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = parsedBodyweightKg(bodyweight, unit);
    if (parsed.kind === 'problem') return setProblem(parsed.problem);
    const bodyweightKg = parsed.value;
    if (bodyweightKg === null) return setProblem('Enter your bodyweight.');
    setSaving(true);
    setProblem(null);
    try {
      await onSave(bodyweightKg);
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
        <DecimalInput value={bodyweight} onChange={(event) => setBodyweight(event.target.value)} required />
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
