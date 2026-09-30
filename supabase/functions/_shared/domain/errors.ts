export class UnknownExerciseError extends Error {
  readonly exerciseId: string;

  constructor(exerciseId: string) {
    super(`unknown exercise: ${exerciseId}`);
    this.exerciseId = exerciseId;
  }
}

export class BodyweightRequiredError extends Error {
  constructor() {
    super('bodyweight required');
  }
}

export class BodyweightLoadNotZeroError extends Error {
  constructor() {
    super('pure bodyweight sets carry no added load');
  }
}
