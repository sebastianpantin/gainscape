import { type ReactNode, useState } from 'react';

interface ProblemWithRetryProps {
  problem: string;
  onRetry: () => unknown;
}

interface ScreenProblemProps extends ProblemWithRetryProps {
  heading: ReactNode;
  children?: ReactNode;
}

export function ProblemWithRetry({ problem, onRetry }: ProblemWithRetryProps) {
  const [retrying, setRetrying] = useState(false);
  const retry = async () => {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };
  return (
    <section className="panel stack">
      <p className="problem" role="alert">
        {problem}
      </p>
      <button className="button" type="button" disabled={retrying} onClick={() => void retry()}>
        {retrying ? 'Trying again…' : 'Try again'}
      </button>
    </section>
  );
}

export function ScreenProblem({ heading, children, ...problem }: ScreenProblemProps) {
  return (
    <main className="screen stack">
      {heading}
      {children}
      <ProblemWithRetry {...problem} />
    </main>
  );
}
