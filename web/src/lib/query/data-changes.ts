import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { DRAFT_CHANNEL_NAME } from '../../offline/draft-session.ts';
import { openChannel } from '../platform/channel.ts';
import { type ChangeOrigin, type DataChange, dataChangeOf, queryRootsToInvalidate } from './query-freshness-rules.ts';

const DATA_CHANGE_CHANNEL_NAME = 'gainscape.data-changes';

let dataChangeChannel: BroadcastChannel | null | undefined;

function dataChanges(): BroadcastChannel | null {
  dataChangeChannel ??= openChannel(DATA_CHANGE_CHANNEL_NAME);
  return dataChangeChannel;
}

async function invalidateAfter(queryClient: QueryClient, change: DataChange, origin: ChangeOrigin): Promise<void> {
  const refresh = change === 'account-reset' ? queryClient.resetQueries : queryClient.invalidateQueries;
  await Promise.all(
    queryRootsToInvalidate(change, origin).map((root) => refresh.call(queryClient, { queryKey: [root] })),
  );
}

export function announceDataChange(queryClient: QueryClient, change: DataChange): Promise<void> {
  dataChanges()?.postMessage({ change });
  return invalidateAfter(queryClient, change, 'this-tab');
}

export function useDataChangeInvalidation(): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    const invalidateOn = (event: MessageEvent<unknown>) => {
      const change = dataChangeOf(event.data);
      if (change) void invalidateAfter(queryClient, change, 'other-tab');
    };
    const drafts = openChannel(DRAFT_CHANNEL_NAME);
    const otherTabs = dataChanges();
    drafts?.addEventListener('message', invalidateOn);
    otherTabs?.addEventListener('message', invalidateOn);
    return () => {
      drafts?.close();
      otherTabs?.removeEventListener('message', invalidateOn);
    };
  }, [queryClient]);
}
