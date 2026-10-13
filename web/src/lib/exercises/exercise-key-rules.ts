export function exerciseKeys(exercises: readonly { exerciseId: string }[]): string[] {
  const seen = new Map<string, number>();
  return exercises.map(({ exerciseId }) => {
    const occurrence = seen.get(exerciseId) ?? 0;
    seen.set(exerciseId, occurrence + 1);
    return `${exerciseId}-${occurrence}`;
  });
}
