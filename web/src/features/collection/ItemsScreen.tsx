import { useState } from 'react';
import { ItemIcon } from '../../components/PixelArt.tsx';
import { SampleNote } from '../../components/SampleNote.tsx';
import { SAMPLE_ITEM_GROUPS, type SampleItem, TIER_COLORS } from '../../lib/sample-data.ts';
import { CollectionTabs } from './CollectionScreen.tsx';

const ALL_ITEMS = SAMPLE_ITEM_GROUPS.flatMap((group) => group.items);

function kindLabel(item: SampleItem): string {
  if (item.icon === 'scroll') return 'Scroll';
  if (item.quantity !== undefined) return `Material · ${item.tier}`;
  return `Gear · ${item.tier} tier`;
}

function ItemDetail({ item }: { item: SampleItem }) {
  const recipe = item.craftsInto;
  const ready = recipe?.inputs.every((input) => input.have >= input.need) ?? false;
  return (
    <section className="panel stack" aria-live="polite">
      <span className="stack" style={{ gap: 2 }}>
        <span className="muted tiny">{kindLabel(item)}</span>
        <h2 className="accent-text">
          {item.name}
          {item.quantity !== undefined && ` ×${item.quantity}`}
        </h2>
        <span className="muted">{item.description}</span>
      </span>
      {recipe && (
        <>
          <div className="well recipe">
            <span className="muted tiny">Craft into {recipe.name}</span>
            {recipe.inputs.map((input) => (
              <span className="row spread" key={input.name}>
                <span>{input.name}</span>
                <span className={input.have >= input.need ? 'have-enough' : 'have-too-few'}>
                  {input.have} / {input.need}
                </span>
              </span>
            ))}
          </div>
          <button className={ready ? 'button primary' : 'button'} type="button" disabled>
            {ready ? `Craft ${recipe.name}` : 'Need more materials'}
          </button>
        </>
      )}
    </section>
  );
}

export function ItemsScreen() {
  const [pickedId, setPickedId] = useState(ALL_ITEMS.find((item) => item.isNew)?.id ?? ALL_ITEMS[0].id);
  const picked = ALL_ITEMS.find((item) => item.id === pickedId) ?? ALL_ITEMS[0];

  return (
    <main className="screen stack">
      <h1 className="title">Collection log</h1>
      <CollectionTabs />
      <SampleNote feature="Loot and crafting" />
      {SAMPLE_ITEM_GROUPS.map((group) => (
        <div className="panel stack" key={group.title}>
          <div className="row spread">
            <h2>{group.title}</h2>
            <span className="muted">{group.items.length} found</span>
          </div>
          <ul className="item-grid">
            {group.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={item.isNew ? 'item-slot new' : 'item-slot'}
                  aria-pressed={item.id === pickedId}
                  aria-label={item.quantity === undefined ? item.name : `${item.name} ×${item.quantity}`}
                  onClick={() => setPickedId(item.id)}
                >
                  <ItemIcon kind={item.icon} color={item.tier ? TIER_COLORS[item.tier] : '#d8c8a8'} />
                  {item.quantity !== undefined && <span className="item-qty">{item.quantity}</span>}
                </button>
              </li>
            ))}
            {Array.from({ length: Math.max(0, group.slots - group.items.length) }, (_, index) => (
              <li key={`locked-${index}`}>
                <button type="button" className="item-slot" aria-label="Not found yet" disabled>
                  <ItemIcon kind="locked" color="#5c4f3d" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <ItemDetail item={picked} />
    </main>
  );
}
