import { useQuery } from '@tanstack/react-query';
import { cacheFirstNotice } from '../../offline/cache-first.ts';
import { OFFLINE_SKILLS_NOTICE } from '../../offline/standing-cache.ts';
import { standingQuery } from '../query/queries.ts';
import { loadedState } from '../query/query-state-rules.ts';
import { type Standing } from './standing-rules.ts';

export type StandingState =
  | { status: 'loading' }
  | { status: 'failed'; problem: string }
  | { status: 'ready'; standing: Standing; notice: string | null };

export function useStanding(userId: string): StandingState {
  const query = useQuery(standingQuery(userId));
  const state = loadedState(query.data, query.error);
  return state.status === 'ready'
    ? { status: 'ready', standing: state.data.loaded, notice: cacheFirstNotice(state.data, OFFLINE_SKILLS_NOTICE) }
    : state;
}
