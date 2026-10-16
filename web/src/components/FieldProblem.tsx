export function FieldProblem({ id, problem }: { id: string; problem: string | null | undefined }) {
  if (!problem) return null;
  return (
    <p className="problem" id={id}>
      {problem}
    </p>
  );
}
