import { createLocalDraftStore } from '../../web/src/offline/draft-store.ts';
import { describeDraftStoreContract } from './draft-store.contract.ts';
import { MemoryStorage } from './memory-storage.ts';

describeDraftStoreContract('localStorage fallback', async () => {
  const storage = new MemoryStorage();
  return { store: createLocalDraftStore(storage), storage, indexedDB: undefined };
});
