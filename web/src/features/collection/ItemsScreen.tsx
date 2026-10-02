import { canCraft, recipeFor } from '@domain/crafting.ts';
import { useCallback, useEffect, useState } from 'react';
import { ItemIcon } from '../../components/PixelArt.tsx';
import { fetchExercises } from '../../lib/catalog.ts';
import type { Exercise } from '../../lib/catalog-rules.ts';
import {
  type CatalogItem,
  colorFor,
  craftProblemText,
  groupItems,
  type HeldItem,
  type ItemCatalog,
  itemNameLookup,
  kindLabel,
  LOCKED_COLOR,
  newItemIds,
  quantities,
  showsQuantity,
  tiersOf,
} from '../../lib/item-rules.ts';
import { craftItem, fetchInventory, fetchItemCatalog } from '../../lib/items.ts';
import { recallLastSummary } from '../summary/last-summary.ts';
import { CollectionTabs } from './CollectionScreen.tsx';

interface ItemDetailProps {
  item: CatalogItem;
  catalog: ItemCatalog;
  held: ReadonlyMap<string, HeldItem>;
  exercises: readonly Exercise[];
  onCrafted: (outputItemId: string) => Promise<void>;
  onCatalogStale: () => Promise<void>;
}

function ItemDetail({ item, catalog, held, exercises, onCrafted, onCatalogStale }: ItemDetailProps) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const nameOf = itemNameLookup(catalog.items, 'Unknown item');
  const recipe = recipeFor(item.id, catalog.recipes, tiersOf(catalog.items));
  const inventory = quantities(held);
  const ready = recipe !== undefined && canCraft(recipe, inventory);
  const quantity = held.get(item.id)?.quantity ?? 0;
  const grants = item.grantsExerciseId && exercises.find((exercise) => exercise.id === item.grantsExerciseId);

  const craft = async () => {
    if (!recipe) return;
    setBusy(true);
    setProblem(null);
    const outcome = await craftItem(recipe.id);
    if (outcome.kind === 'ok') {
      await onCrafted(outcome.result.itemId);
    } else {
      setProblem(craftProblemText(outcome.problem, nameOf));
      if (outcome.problem.kind === 'unknown_recipe') await onCatalogStale();
      else await onCrafted(item.id);
    }
    setBusy(false);
  };

  return (
    <section className="panel stack" aria-live="polite" aria-label="Item details">
      <span className="stack" style={{ gap: 2 }}>
        <span className="muted tiny">{kindLabel(item)}</span>
        <h2 className="accent-text">
          {item.name}
          {showsQuantity(item, { quantity }) && ` ×${quantity}`}
        </h2>
        {item.description && <span className="muted">{item.description}</span>}
        {item.kind === 'scroll' && (
          <span className="muted">Unlocks {grants ? grants.name : 'a new exercise variation'}</span>
        )}
      </span>
      {recipe && (
        <>
          <div className="well recipe">
            <span className="muted tiny">Craft into {nameOf(recipe.outputItemId)}</span>
            {recipe.inputs.map((input) => {
              const have = inventory.get(input.itemId) ?? 0;
              return (
                <span className="row spread" key={input.itemId}>
                  <span>{nameOf(input.itemId)}</span>
                  <span className={have >= input.quantity ? 'have-enough' : 'have-too-few'}>
                    {have} / {input.quantity}
                  </span>
                </span>
              );
            })}
          </div>
          <button
            className={ready ? 'button primary' : 'button'}
            type="button"
            disabled={!ready || busy}
            onClick={() => void craft()}
          >
            {busy ? 'Crafting…' : ready ? `Craft ${nameOf(recipe.outputItemId)}` : 'Need more materials'}
          </button>
        </>
      )}
      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
    </section>
  );
}

interface ItemsScreenProps {
  userId: string;
}

export function ItemsScreen({ userId }: ItemsScreenProps) {
  const [catalog, setCatalog] = useState<ItemCatalog | null>(null);
  const [held, setHeld] = useState<Map<string, HeldItem>>(new Map());
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [loadProblem, setLoadProblem] = useState<string | null>(null);
  const [newIds] = useState(() => newItemIds(recallLastSummary()?.drops));

  const refetchInventory = useCallback(async () => {
    try {
      setHeld(await fetchInventory(userId));
    } catch (error) {
      setLoadProblem((error as Error).message);
    }
  }, [userId]);

  const refetchCatalog = useCallback(async () => {
    try {
      setCatalog(await fetchItemCatalog());
    } catch (error) {
      setLoadProblem((error as Error).message);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([fetchItemCatalog(), fetchInventory(userId), fetchExercises({ includeArchived: true })]).then(
      ([loadedCatalog, loadedHeld, loadedExercises]) => {
        if (!active) return;
        setCatalog(loadedCatalog);
        setHeld(loadedHeld);
        setExercises(loadedExercises);
        const found = loadedCatalog.items.filter((item) => loadedHeld.has(item.id));
        setPickedId((found.find((item) => newIds.has(item.id)) ?? found[0])?.id ?? null);
      },
      (error: Error) => active && setLoadProblem(error.message),
    );
    return () => {
      active = false;
    };
  }, [userId, newIds]);

  const header = (
    <>
      <h1 className="title">Collection log</h1>
      <CollectionTabs />
    </>
  );

  if (loadProblem)
    return (
      <main className="screen stack">
        {header}
        <p className="problem" role="alert">
          {loadProblem}
        </p>
      </main>
    );
  if (!catalog)
    return (
      <main className="screen stack">
        {header}
        <p>Loading…</p>
      </main>
    );

  const groups = groupItems(catalog.items, held, newIds);
  const picked = catalog.items.find((item) => item.id === pickedId && held.has(item.id));

  return (
    <main className="screen stack">
      {header}
      {groups.map((group) => (
        <div className="panel stack" key={group.title}>
          <div className="row spread">
            <h2>{group.title}</h2>
            <span className="muted" data-testid={`found-${group.title.toLowerCase()}`}>
              {group.found}/{group.slots} found
            </span>
          </div>
          <ul className="item-grid" aria-label={group.title}>
            {group.entries.map(({ item, held: entry, isNew }) =>
              entry ? (
                <li key={item.id}>
                  <button
                    type="button"
                    className={isNew ? 'item-slot new' : 'item-slot'}
                    aria-pressed={item.id === picked?.id}
                    aria-label={showsQuantity(item, entry) ? `${item.name} ×${entry.quantity}` : item.name}
                    onClick={() => setPickedId(item.id)}
                  >
                    <ItemIcon kind={item.icon} color={colorFor(item)} />
                    {showsQuantity(item, entry) && <span className="item-qty">{entry.quantity}</span>}
                  </button>
                </li>
              ) : (
                <li key={item.id}>
                  <button type="button" className="item-slot" aria-label="Not found yet" disabled>
                    <ItemIcon kind="locked" color={LOCKED_COLOR} />
                  </button>
                </li>
              ),
            )}
          </ul>
        </div>
      ))}
      {picked ? (
        <ItemDetail
          key={picked.id}
          item={picked}
          catalog={catalog}
          held={held}
          exercises={exercises}
          onCrafted={async (itemId) => {
            await refetchInventory();
            setPickedId(itemId);
          }}
          onCatalogStale={refetchCatalog}
        />
      ) : (
        <p className="panel muted">Hard sets can drop items. Finish a workout to find your first one.</p>
      )}
    </main>
  );
}
