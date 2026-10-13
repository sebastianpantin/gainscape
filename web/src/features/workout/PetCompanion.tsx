import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ItemIcon } from '../../components/PixelArt.tsx';
import { companionPetStore } from '../../lib/companion-pet-store.ts';
import { colorFor, companionPet } from '../../lib/item-rules.ts';
import { ownedPetsQuery } from '../../lib/queries.ts';
import { deviceStorage } from '../../lib/keyed-store.ts';

export function PetCompanion({ userId }: { userId: string }) {
  const pets = useQuery(ownedPetsQuery(userId));
  const [chosenId] = useState(() => companionPetStore.read(deviceStorage(), userId));
  const pet = pets.data ? companionPet(pets.data.items, pets.data.held, chosenId) : null;
  if (!pet) return null;
  return (
    <Link className="pet-companion" to="/collection/items" aria-label={`${pet.name}, your companion`}>
      <span className="pet-companion-art" aria-hidden="true">
        <ItemIcon kind={pet.icon} color={colorFor(pet)} />
      </span>
      <span className="muted tiny" aria-hidden="true">
        {pet.name}
      </span>
    </Link>
  );
}
