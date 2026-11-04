export type Parsed<T> = { kind: 'ok'; value: T } | { kind: 'problem'; problem: string };

type ParsedValues<Fields extends Record<string, Parsed<unknown>>> = {
  [Key in keyof Fields]: Extract<Fields[Key], { kind: 'ok' }>['value'];
};

export function problemOf(parsed: Parsed<unknown>): string | null {
  return parsed.kind === 'problem' ? parsed.problem : null;
}

export function parsedValues<Fields extends Record<string, Parsed<unknown>>>(
  fields: Fields,
): ParsedValues<Fields> | null {
  const values: Record<string, unknown> = {};
  for (const [key, parsed] of Object.entries(fields)) {
    if (parsed.kind === 'problem') return null;
    values[key] = parsed.value;
  }
  return values as ParsedValues<Fields>;
}
