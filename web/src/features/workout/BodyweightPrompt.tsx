import { type FormEvent, useState } from 'react';

const LOWEST_BODYWEIGHT_KG = 20;
const HIGHEST_BODYWEIGHT_KG = 400;

interface BodyweightPromptProps {
  onSave: (bodyweightKg: number) => Promise<void>;
}

export function BodyweightPrompt({ onSave }: BodyweightPromptProps) {
  const [bodyweight, setBodyweight] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setProblem(null);
    try {
      await onSave(Number(bodyweight));
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not save your bodyweight.');
      setSaving(false);
    }
  }

  return (
    <form className="panel stack" onSubmit={submit}>
      <p>Bodyweight exercises count your bodyweight as the load. It stays private.</p>
      <label className="field">
        Bodyweight (kg)
        <input
          type="number"
          inputMode="decimal"
          min={LOWEST_BODYWEIGHT_KG}
          max={HIGHEST_BODYWEIGHT_KG}
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
        Save and finish workout
      </button>
    </form>
  );
}
