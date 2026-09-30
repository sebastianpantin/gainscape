import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { createIdbDraftStore, openDraftDatabase } from '../../web/src/offline/draft-store.ts';
import { describeDraftStoreContract } from './draft-store.contract.ts';
import { MemoryStorage } from './memory-storage.ts';

describeDraftStoreContract('IndexedDB', async () => {
  const indexedDB = new IDBFactory();
  const database = await openDraftDatabase(indexedDB);
  return { store: createIdbDraftStore(database!), storage: new MemoryStorage(), indexedDB };
});
