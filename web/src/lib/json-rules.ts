export function parsedJson(raw: string | null): unknown {
  try {
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}
