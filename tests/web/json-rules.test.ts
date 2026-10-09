import { describe, expect, it } from 'vitest';
import { parsedJson } from '../../web/src/lib/json-rules.ts';

describe('parsed JSON', () => {
  it('parses a stored JSON string', () => {
    expect(parsedJson('{"restS":90}')).toEqual({ restS: 90 });
    expect(parsedJson('[1,2]')).toEqual([1, 2]);
  });

  it('reads a missing value as null', () => {
    expect(parsedJson(null)).toBeNull();
  });

  it('reads malformed JSON as null instead of throwing', () => {
    expect(parsedJson('{not json')).toBeNull();
    expect(parsedJson('')).toBeNull();
  });
});
