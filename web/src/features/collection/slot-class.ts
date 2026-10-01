export function slotClass(slot: { exact: boolean } | null): string {
  if (!slot) return 'record-slot empty';
  return slot.exact ? 'record-slot filled' : 'record-slot';
}
