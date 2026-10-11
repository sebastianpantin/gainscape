import { useQuery } from '@tanstack/react-query';
import { loadoutQuery } from '../../lib/queries.ts';

export function useLoadout(userId: string) {
  return useQuery(loadoutQuery(userId));
}
