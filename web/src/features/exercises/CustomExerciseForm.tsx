import { type FormEvent, useEffect, useState } from 'react';
import {
  EQUIPMENT,
  type Equipment,
  type Exercise,
  LOAD_TYPES,
  type LoadType,
  type Modality,
  type Skill,
} from '../../lib/catalog-rules.ts';
import { fetchExerciseShares, hasLoggedSet, saveCustomExercise, type SkillShare } from '../../lib/custom-exercises.ts';
import { nameProblem, trimmedName } from '../../lib/names.ts';
import { percentsFromShares, shareTotal, sharesToSave, skillsForModality } from './share-form.ts';

const NAME_MAX_LENGTH = 60;

const MODALITY_LABELS: Record<Modality, string> = { lift: 'Lift', cardio: 'Cardio' };
const MODALITIES: Modality[] = ['lift', 'cardio'];

const LOAD_TYPE_LABELS: Record<LoadType, string> = {
  external: 'External load',
  bodyweight: 'Bodyweight',
  bodyweight_plus: 'Bodyweight plus load',
};

interface CustomExerciseFormProps {
  exercise: Exercise | null;
  skills: Skill[];
  onSaved: () => void;
  onCancel: () => void;
}

export function CustomExerciseForm({ exercise, skills, onSaved, onCancel }: CustomExerciseFormProps) {
  const [id] = useState(() => exercise?.id ?? crypto.randomUUID());
  const [name, setName] = useState(exercise?.name ?? '');
  const [modality, setModality] = useState<Modality>(exercise?.modality ?? 'lift');
  const [loadType, setLoadType] = useState<LoadType>(exercise?.modality === 'lift' ? exercise.loadType : 'external');
  const [equipment, setEquipment] = useState<Equipment>((exercise?.equipment as Equipment | undefined) ?? 'other');
  const [percents, setPercents] = useState<Record<string, string>>({});
  const [storedShares, setStoredShares] = useState<SkillShare[]>([]);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(exercise !== null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!exercise) return;
    let active = true;
    Promise.all([fetchExerciseShares(exercise.id), hasLoggedSet(exercise.id)]).then(
      ([shares, logged]) => {
        if (!active) return;
        setPercents(percentsFromShares(shares));
        setStoredShares(shares);
        setLocked(logged);
        setLoading(false);
      },
      (error: Error) => active && setProblem(error.message),
    );
    return () => {
      active = false;
    };
  }, [exercise]);

  const offeredSkills = skillsForModality(skills, modality);
  const shareForm = { skillIds: offeredSkills.map((skill) => skill.id), percents, locked, storedShares };
  const total = shareTotal(shareForm);
  const shares = sharesToSave(shareForm);
  const nameIssue = nameProblem(name, NAME_MAX_LENGTH);
  const canSave = !loading && !saving && nameIssue === null && shares !== null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setProblem(null);
    try {
      await saveCustomExercise({
        id,
        name: trimmedName(name),
        modality,
        loadType: modality === 'lift' ? loadType : null,
        equipment,
        shares: shares!,
      });
      onSaved();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not save the exercise.');
      setSaving(false);
    }
  }

  return (
    <form className="panel stack" onSubmit={submit} aria-label={exercise ? 'Edit exercise' : 'New exercise'}>
      <h2>{exercise ? `Edit ${exercise.name}` : 'New custom exercise'}</h2>
      <label className="field">
        Name
        <input value={name} maxLength={NAME_MAX_LENGTH} onChange={(event) => setName(event.target.value)} required />
      </label>
      {name !== '' && nameIssue && <p className="problem">{nameIssue}</p>}
      {exercise === null && (
        <div className="field">
          Kind
          <div className="choice-pair" role="radiogroup" aria-label="Kind">
            {MODALITIES.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={option === modality}
                className={`effort-option ${option === modality ? 'selected' : ''}`}
                onClick={() => setModality(option)}
              >
                {MODALITY_LABELS[option]}
              </button>
            ))}
          </div>
        </div>
      )}
      {modality === 'lift' && (
        <label className="field">
          Load type
          <select value={loadType} disabled={locked} onChange={(event) => setLoadType(event.target.value as LoadType)}>
            {LOAD_TYPES.map((option) => (
              <option key={option} value={option}>
                {LOAD_TYPE_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="field">
        Equipment
        <select value={equipment} onChange={(event) => setEquipment(event.target.value as Equipment)}>
          {EQUIPMENT.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      {locked && (
        <p className="muted">
          {modality === 'lift' ? 'Load type and skill shares are' : 'Skill shares are'} locked after logging.
        </p>
      )}
      <fieldset className="stack" disabled={locked}>
        <legend>Skill shares (%)</legend>
        {offeredSkills.map((skill) => (
          <label className="compact-field" key={skill.id}>
            {skill.name}
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              step={1}
              value={percents[skill.id] ?? ''}
              onChange={(event) => setPercents({ ...percents, [skill.id]: event.target.value })}
            />
          </label>
        ))}
      </fieldset>
      <p data-testid="share-total" className={shares !== null ? '' : 'problem'}>
        Total: {total}%
      </p>
      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
      <div className="row">
        <button className="button primary" type="submit" disabled={!canSave}>
          Save exercise
        </button>
        <button className="button" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
