import { Link } from 'react-router-dom';
import { ItemIcon } from '../../components/PixelArt.tsx';
import { type CatalogItem, colorFor } from '../../lib/collection/item-rules.ts';

const HERO_PET_SIZE = 72;

export function PetCompanion({ pet }: { pet: CatalogItem }) {
  return (
    <Link className="pet-companion" to="/collection/items" aria-label={`${pet.name}, your companion`}>
      <span className="pet-companion-art" aria-hidden="true">
        <ItemIcon kind={pet.icon} color={colorFor(pet)} size={HERO_PET_SIZE} />
      </span>
      <span className="muted tiny" aria-hidden="true">
        {pet.name}
      </span>
    </Link>
  );
}
