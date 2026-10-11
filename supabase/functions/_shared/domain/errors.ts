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

export class DistanceNotTrackedError extends Error {
  readonly exerciseId: string;

  constructor(exerciseId: string) {
    super(`exercise ${exerciseId} tracks no distance`);
    this.exerciseId = exerciseId;
  }
}

export class KindMismatchError extends Error {
  readonly exerciseId: string;

  constructor(exerciseId: string) {
    super(`set kind does not match the modality of exercise ${exerciseId}`);
    this.exerciseId = exerciseId;
  }
}
