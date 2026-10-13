import { useQuery } from '@tanstack/react-query';
import { loadoutQuery } from '../../lib/query/queries.ts';

export function useLoadout(userId: string) {
  return useQuery(loadoutQuery(userId));
}
