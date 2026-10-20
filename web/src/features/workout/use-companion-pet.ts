import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { companionPetStore } from '../../lib/collection/companion-pet-store.ts';
import { type CatalogItem, companionPet } from '../../lib/collection/item-rules.ts';
import { deviceStorage } from '../../lib/platform/keyed-store.ts';
import { ownedPetsQuery } from '../../lib/query/queries.ts';

export function useCompanionPet(userId: string): CatalogItem | null {
  const pets = useQuery(ownedPetsQuery(userId));
  const [chosenId] = useState(() => companionPetStore.read(deviceStorage(), userId));
  return pets.data ? companionPet(pets.data.items, pets.data.held, chosenId) : null;
}
