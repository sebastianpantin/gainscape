import { Link } from 'react-router-dom';
import { ItemIcon } from '../../components/PixelArt.tsx';
import { type CatalogItem, colorFor } from '../../lib/collection/item-rules.ts';
import { type PetMood, petCompanionLabel } from './pet-mood-rules.ts';

const SCENE_PET_SIZE = 36;

export function PetCompanion({ pet, mood }: { pet: CatalogItem; mood: PetMood | null }) {
  return (
    <Link
      className={mood === null ? 'pet-companion' : `pet-companion ${mood}`}
      to="/collection/items"
      aria-label={petCompanionLabel(pet.name, mood)}
    >
      <span className="pet-companion-art" aria-hidden="true">
        <ItemIcon kind={pet.icon} color={colorFor(pet)} size={SCENE_PET_SIZE} />
      </span>
    </Link>
  );
}
