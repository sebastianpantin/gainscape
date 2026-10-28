import { useState } from 'react';
import { ProgressBar } from '../../components/ProgressBar.tsx';
import {
  canStartQuest,
  type QuestCard as QuestCardView,
  questPointsText,
  type StepState,
} from '../../lib/quests/quest-rules.ts';

const STEP_STATE_LABELS: Record<StepState, string> = { done: 'Done', current: 'Now', upcoming: 'Later' };

interface QuestCardProps {
  card: QuestCardView;
  offline: boolean;
  primary: boolean;
  onStart: () => Promise<string | null>;
}

export function QuestCard({ card, offline, primary, onStart }: QuestCardProps) {
  const [starting, setStarting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const { quest, status } = card;
  const headingId = `quest-${quest.key}`;
  const showsRequirements = card.requirements.length > 0 && (status === 'available' || status === 'locked');

  const start = async () => {
    setStarting(true);
    setProblem(null);
    setProblem(await onStart());
    setStarting(false);
  };

  return (
    <article className="panel stack quest-card" aria-labelledby={headingId}>
      <div className="row spread">
        <h3 id={headingId}>{quest.name}</h3>
        <span className="muted tiny">{questPointsText(quest.questPoints)}</span>
      </div>
      <p className="muted">{quest.description}</p>
      {showsRequirements && (
        <ul className="quest-list" aria-label="Requirements">
          {card.requirements.map((requirement) => (
            <li key={requirement.text} className={requirement.met ? 'have-enough' : 'have-too-few'}>
              <span className="quest-mark">{requirement.met ? 'Met' : 'Not met'}</span> {requirement.text}
            </li>
          ))}
        </ul>
      )}
      <ol className="quest-list" aria-label="Steps">
        {card.steps.map((step, index) => (
          <li key={index} className={`quest-step ${step.state}`}>
            <span className="quest-mark">{STEP_STATE_LABELS[step.state]}</span> {step.text}
            {step.progress && (
              <span className="stack quest-progress">
                <ProgressBar fraction={step.progress.fraction} label={`${quest.name} step ${index + 1} progress`} />
                <span className="muted tiny">{step.progress.text}</span>
              </span>
            )}
          </li>
        ))}
      </ol>
      <ul className="quest-list quest-rewards" aria-label="Rewards">
        {card.rewards.map((reward) => (
          <li key={reward}>{reward}</li>
        ))}
      </ul>
      {card.unlocks.length > 0 && <p className="muted tiny">Unlocks {card.unlocks.join(', ')}</p>}
      {status === 'available' && (
        <>
          <button
            className={primary ? 'button primary' : 'button'}
            type="button"
            disabled={!canStartQuest(status, offline) || starting}
            onClick={() => void start()}
          >
            {starting ? 'Starting…' : `Start ${quest.name}`}
          </button>
          {offline && <p className="muted tiny">Connect to start this quest.</p>}
        </>
      )}
      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
    </article>
  );
}
