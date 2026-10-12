import { QueryClient } from '@tanstack/react-query';
import { isDeviceOffline } from '../offline/cache-first.ts';
import { staleTimeFor } from './query-freshness-rules.ts';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        networkMode: 'always',
        staleTime: (query) => staleTimeFor(query.queryKey, query.state.data, { deviceOffline: isDeviceOffline() }),
      },
    },
  });
}
