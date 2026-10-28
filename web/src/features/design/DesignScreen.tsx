import { type ReactNode, useId, useRef, useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx';
import { EmptyState } from '../../components/EmptyState.tsx';
import { NumberTextField } from '../../components/NumberTextField.tsx';
import { ProblemWithRetry } from '../../components/ScreenProblem.tsx';
import { ListSkeleton } from '../../components/ScreenSkeleton.tsx';
import { SegmentedChoice } from '../../components/SegmentedChoice.tsx';
import { Switch } from '../../components/Switch.tsx';
import { useToast } from '../../lib/ui/toast.ts';
import { DEFAULT_PLATE_SETTINGS, barbellPlates, barbellPlatesText } from '../../lib/workout/plate-rules.ts';
import { type DraftSet } from '../../offline/draft-format.ts';
import tokensCss from '../../styles/tokens.css?raw';
import { CardioEffortSelector } from '../workout/CardioEffortSelector.tsx';
import { SetRow } from '../workout/SetRow.tsx';

const TOKEN_NAMES = [...tokensCss.matchAll(/(--[a-z0-9-]+):/g)].map((match) => match[1]);
const COLOR_TOKENS = TOKEN_NAMES.filter((name) => name.startsWith('--color-'));
const SPACE_TOKENS = TOKEN_NAMES.filter((name) => name.startsWith('--space-'));
const TYPE_TOKENS = TOKEN_NAMES.filter((name) => name.startsWith('--font-size-'));

const BAR_SETUP = { ...DEFAULT_PLATE_SETTINGS.kg, barFromProgram: false };

const SAMPLE_SETS: readonly DraftSet[] = [
  {
    id: 'design-set-1',
    weightKg: 100,
    reps: 5,
    isWarmup: false,
    effort: { type: 'level', level: 'hard' },
    done: true,
  },
  {
    id: 'design-set-2',
    weightKg: 100,
    reps: 5,
    isWarmup: false,
    effort: null,
    done: false,
  },
];

function GallerySection({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <section className="panel stack" aria-labelledby={headingId}>
      <h2 id={headingId}>{title}</h2>
      {children}
    </section>
  );
}

function TokenList({ names, sample }: { names: readonly string[]; sample: (name: string) => ReactNode }) {
  return (
    <ul className="stack exercise-list">
      {names.map((name) => (
        <li key={name} className="row">
          {sample(name)}
          <code>{name}</code>
        </li>
      ))}
    </ul>
  );
}

function SampleSetRows() {
  const [sets, setSets] = useState(SAMPLE_SETS);
  const menu = useRef<HTMLButtonElement>(null);
  const change = (id: string, changes: Partial<Omit<DraftSet, 'id'>>) =>
    setSets((current) => current.map((set) => (set.id === id ? { ...set, ...changes } : set)));
  return (
    <section className="panel stack exercise-card" aria-label="Sample exercise">
      <h2>Set row: Barbell Bench Press</h2>
      <ol className="set-list">
        {sets.map((set, index) => (
          <SetRow
            key={set.id}
            setNumber={index + 1}
            loadType="external"
            set={set}
            current={set.id === sets.find((candidate) => !candidate.done)?.id}
            preview={{ xp: 42, basis: set.done ? 'logged' : 'estimated', rir: 2 }}
            record={null}
            drop={null}
            unit="kg"
            effortMode="level"
            markers={[]}
            barbell={{
              plates: barbellPlates(set.weightKg, BAR_SETUP, 'kg').plates,
              text: barbellPlatesText(set.weightKg, BAR_SETUP, 'kg'),
              setup: BAR_SETUP,
            }}
            last={{ weightKg: 97.5, reps: 5 }}
            backoff={null}
            onChange={(changes) => change(set.id, changes)}
            menuRef={menu}
            onRemove={() => undefined}
            onToggleDone={() => change(set.id, { done: !set.done })}
            focusDone={false}
            onDoneFocused={() => undefined}
          />
        ))}
      </ol>
    </section>
  );
}

export function DesignScreen() {
  const { showToast } = useToast();
  const [unit, setUnit] = useState<'kg' | 'lb'>('kg');
  const [reminders, setReminders] = useState(true);
  const [bodyweight, setBodyweight] = useState(80);
  const [gz, setGz] = useState(true);
  const [confirming, setConfirming] = useState(false);
  return (
    <main className="screen stack">
      <h1 className="title">Design</h1>
      <p className="muted">Development-only gallery of the tokens and shared controls in docs/design-system.md.</p>

      <GallerySection title="Colour tokens">
        <TokenList
          names={COLOR_TOKENS}
          sample={(name) => (
            <span className="line-chart-swatch" aria-hidden="true" style={{ background: `var(${name})` }} />
          )}
        />
      </GallerySection>

      <GallerySection title="Spacing">
        <TokenList
          names={SPACE_TOKENS}
          sample={(name) => (
            <span className="meter" aria-hidden="true" style={{ width: `calc(var(${name}) * 4)` }}>
              <span className="meter-fill" style={{ width: '100%' }} />
            </span>
          )}
        />
      </GallerySection>

      <GallerySection title="Type scale">
        <TokenList
          names={TYPE_TOKENS}
          sample={(name) => (
            <span className="pixel" style={{ fontSize: `var(${name})` }}>
              Aa
            </span>
          )}
        />
      </GallerySection>

      <GallerySection title="Buttons">
        <div className="row wrap">
          <button type="button" className="button primary">
            Primary
          </button>
          <button type="button" className="button">
            Default
          </button>
          <button type="button" className="button danger">
            Danger
          </button>
          <button type="button" className="button outline">
            Outline
          </button>
          <button type="button" className="button dashed">
            Dashed
          </button>
          <button type="button" className="button link">
            Link
          </button>
          <button type="button" className="button icon" aria-label="Add">
            +
          </button>
          <button type="button" className="button" disabled>
            Disabled
          </button>
        </div>
        <button type="button" className="button primary big">
          Primary big
        </button>
        <div className="row wrap">
          <button
            type="button"
            className="button toggle gz-button"
            aria-pressed={gz}
            aria-label={gz ? 'Remove your gz' : 'Congratulate (gz)'}
            onClick={() => setGz(!gz)}
          >
            <span className="pixel">gz</span>
            <span className="tiny">3</span>
          </button>
          <button
            type="button"
            className="button toggle gz-button"
            aria-pressed={false}
            aria-label="Congratulate a friend"
          >
            <span className="pixel">gz</span>
            <span className="tiny">0</span>
          </button>
        </div>
        <CardioEffortSelector selected={{ type: 'cardio', level: 'moderate' }} onSelect={() => undefined} />
      </GallerySection>

      <GallerySection title="Choices and fields">
        <SegmentedChoice
          label="Units"
          options={[
            { value: 'kg', label: 'Kilograms' },
            { value: 'lb', label: 'Pounds' },
          ]}
          current={unit}
          onPick={setUnit}
        />
        <Switch
          label="Rest reminders"
          hint="Buzz when the rest timer ends."
          checked={reminders}
          onChange={setReminders}
        />
        <label className="field">
          <NumberTextField
            label="Bodyweight (kg)"
            value={bodyweight}
            lowest={20}
            highest={400}
            onCommit={setBodyweight}
          />
        </label>
      </GallerySection>

      <SampleSetRows />

      <GallerySection title="Chips and tags">
        <div className="row wrap">
          <span className="stalled-tag">Stalled</span>
          <span className="history-record-badge">PR</span>
          <span className="streak-badge">3 week streak</span>
          <span className="warmup-badge">W</span>
        </div>
      </GallerySection>

      <GallerySection title="Screen states">
        <ListSkeleton panels={1} />
        <ProblemWithRetry problem="Could not load this. Check your connection." onRetry={() => undefined} />
        <EmptyState text="No workouts yet." startLabel="Start a workout" />
      </GallerySection>

      <GallerySection title="Feedback">
        <p className="toast">Saved on this device.</p>
        <div className="row wrap">
          <button
            type="button"
            className="button"
            onClick={() => showToast('Set removed', { label: 'Undo', onAct: () => undefined })}
          >
            Show toast
          </button>
          <button type="button" className="button" onClick={() => setConfirming(true)}>
            Open confirm dialog
          </button>
        </div>
      </GallerySection>

      {confirming && (
        <ConfirmDialog
          title="Delete this workout?"
          confirmLabel="Delete"
          danger
          onConfirm={() => setConfirming(false)}
          onCancel={() => setConfirming(false)}
        >
          <p>This cannot be undone.</p>
        </ConfirmDialog>
      )}
    </main>
  );
}
