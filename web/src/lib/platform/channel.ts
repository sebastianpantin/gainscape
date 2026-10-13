export function openChannel(name: string): BroadcastChannel | null {
  return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(name);
}
