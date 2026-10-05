import { Link } from 'react-router-dom';
import { exerciseProgressPath } from '../../lib/exercise-progress-rules.ts';

interface ExerciseProgressLinkProps {
  exerciseId: string;
  exerciseName: string;
}

export function ExerciseProgressLink({ exerciseId, exerciseName }: ExerciseProgressLinkProps) {
  return (
    <Link className="button link" to={exerciseProgressPath(exerciseId)} aria-label={`${exerciseName} progress`}>
      Progress
    </Link>
  );
}
