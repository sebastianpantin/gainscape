const NEW_RECORD_VIBRATION_MS = [60, 40, 60];

export function vibrateNewRecord(): void {
  try {
    navigator.vibrate?.(NEW_RECORD_VIBRATION_MS);
  } catch {
    return;
  }
}
