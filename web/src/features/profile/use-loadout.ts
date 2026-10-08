import { useQuery } from '@tanstack/react-query';
import { fetchLoadout } from '../../lib/items.ts';

export function loadoutQueryKey(userId: string) {
  return ['loadout', userId];
}

export function useLoadout(userId: string) {
  return useQuery({ queryKey: loadoutQueryKey(userId), queryFn: () => fetchLoadout(userId) });
}
