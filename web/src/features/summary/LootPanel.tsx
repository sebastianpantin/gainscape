import type { DropSummary } from '@domain/types.ts';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ItemIcon, LootChestIcon } from '../../components/PixelArt.tsx';
import { type CatalogItem, colorFor, fanfareFor } from '../../lib/collection/item-rules.ts';
import { celebrate, FANFARE_CELEBRATIONS } from '../../lib/platform/celebration-effects.ts';
import { GLOSSARY } from '../../lib/ui/glossary.ts';

const LEGENDARY_GLOW_AFTER_POP_S = 0.35;

function dropAnimationDelay(popDelayS: number, glows: boolean): string {
  return glows ? `${popDelayS}s, ${popDelayS + LEGENDARY_GLOW_AFTER_POP_S}s` : `${popDelayS}s`;
}
const LOOT_DROP_STAGGER_S = 0.08;
export type LoadedItems = CatalogItem[] | 'loading' | 'failed';

function LootDrops({ drops, items }: { drops: readonly DropSummary[]; items: LoadedItems }) {
  if (items === 'loading') return <p className="muted">Loading loot…</p>;
  if (items === 'failed') return <p className="muted">Couldn't load the loot names. See items for what dropped.</p>;
  return (
    <ul className="record-list" aria-label="Loot drops">
      {drops.map((drop, index) => {
        const item = items.find((candidate) => candidate.id === drop.itemId);
        return (
          <li
            key={drop.dropId}
            className={item ? `loot-drop rarity-${item.rarity}` : 'loot-drop'}
            style={{ animationDelay: dropAnimationDelay(index * LOOT_DROP_STAGGER_S, item?.rarity === 'legendary') }}
          >
            <ItemIcon kind={item?.icon ?? 'scraps'} color={item ? colorFor(item) : colorFor({ tier: null })} />
            <span style={{ flex: 1 }}>{item?.name ?? 'Unknown item'}</span>
            <span className="pixel">×{drop.quantity}</span>
            {drop.source === 'pr' && (
              <span className="accent-text tiny" role="img" aria-label={GLOSSARY.pr.name}>
                PR
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

interface LootPanelProps {
  userId: string;
  drops: readonly DropSummary[];
  items: LoadedItems;
  delayS: number;
}

export function LootPanel({ userId, drops, items, delayS }: LootPanelProps) {
  const [open, setOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const hasDrops = drops.length > 0;
  const fanfare = Array.isArray(items)
    ? fanfareFor(drops.flatMap((drop) => items.find((candidate) => candidate.id === drop.itemId)?.rarity ?? []))
    : null;

  const flashes = open && fanfare !== null;

  const openLoot = () => {
    setOpen(true);
    heading.current?.focus();
    if (fanfare) celebrate(userId, FANFARE_CELEBRATIONS[fanfare]);
  };

  return (
    <section
      className={flashes ? `panel stack loot-${fanfare}` : 'panel stack rise'}
      aria-label="Loot"
      style={flashes ? undefined : { animationDelay: `${delayS}s` }}
    >
      <div className="row spread">
        <h2 ref={heading} tabIndex={-1}>
          Loot
        </h2>
        {hasDrops && (
          <Link className="tiny" to="/collection/items">
            See items
          </Link>
        )}
      </div>
      {!hasDrops && <p className="muted">No loot this time</p>}
      {hasDrops && !open && (
        <button type="button" className="loot-chest" onClick={openLoot}>
          <span className="loot-chest-art">
            <LootChestIcon />
          </span>
          Open loot
        </button>
      )}
      {hasDrops && <div role="status">{open && <LootDrops drops={drops} items={items} />}</div>}
    </section>
  );
}
