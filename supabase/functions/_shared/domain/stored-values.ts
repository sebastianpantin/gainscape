import type { VolumeMetric } from './challenges.ts';
import { isRecord } from './types.ts';

interface StoredValueReader {
  record(value: unknown, field: string): Record<string, unknown>;
  array(value: unknown, field: string): unknown[];
  string(value: unknown, field: string): string;
  nullableString(value: unknown, field: string): string | null;
  volumeMetric(value: unknown): VolumeMetric;
}

export function storedValueReader(storedNoun: string): StoredValueReader {
  const string = (value: unknown, field: string): string => {
    if (typeof value !== 'string') throw new RangeError(`a stored ${storedNoun} needs a string ${field}`);
    return value;
  };
  return {
    record(value, field) {
      if (!isRecord(value)) throw new RangeError(`a stored ${storedNoun} needs an object ${field}`);
      return value;
    },
    array(value, field) {
      if (!Array.isArray(value)) throw new RangeError(`a stored ${storedNoun} needs an array ${field}`);
      return value;
    },
    string,
    nullableString(value, field) {
      return value === null || value === undefined ? null : string(value, field);
    },
    volumeMetric(value) {
      if (value !== 'reps' && value !== 'kg') {
        throw new RangeError(`unknown volume metric ${JSON.stringify(value)} in a stored ${storedNoun}`);
      }
      return value;
    },
  };
}
