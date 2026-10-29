import { Link } from 'react-router-dom';
import { ItemIcon } from '../../components/PixelArt.tsx';
import { type CatalogItem, colorFor } from '../../lib/collection/item-rules.ts';
import { type PetMood, petCompanionLabel } from './pet-mood-rules.ts';

const HERO_PET_SIZE = 72;

export function PetCompanion({ pet, mood }: { pet: CatalogItem; mood: PetMood | null }) {
  return (
    <Link
      className={mood === null ? 'pet-companion' : `pet-companion ${mood}`}
      to="/collection/items"
      aria-label={petCompanionLabel(pet.name, mood)}
    >
      <span className="pet-companion-art" aria-hidden="true">
        <ItemIcon kind={pet.icon} color={colorFor(pet)} size={HERO_PET_SIZE} />
      </span>
      <span className="muted tiny" aria-hidden="true">
        {pet.name}
      </span>
    </Link>
  );
}
