import { canCraft, recipeFor } from '@domain/crafting.ts';
import { DEFAULT_ROUNDING } from '@domain/index.ts';
import type { StrengthState } from '@domain/types.ts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmptyState } from '../../components/EmptyState.tsx';
import { ItemIcon } from '../../components/PixelArt.tsx';
import {
  type CatalogChallenge,
  challengeSummaryText,
  exercisesWithoutE1rm,
  missingE1rmText,
} from '../../lib/challenge-rules.ts';
import {
  type CatalogItem,
  colorFor,
  craftProblemText,
  firstPickedItemId,
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
import { messageOf } from '../../lib/error-text.ts';
import {
  craftItem,
  equipGear,
  fetchInventory,
  fetchItemCatalog,
  type LoadedItems,
  unequipGear,
} from '../../lib/items.ts';
import { usePreferences } from '../../lib/preferences.ts';
import { deviceStorage } from '../../lib/rest-timer-store.ts';
import { startDraftFromChallenge } from '../../offline/draft-format.ts';
import { type ChallengeExerciseEntry, OFFLINE_ITEMS_NOTICE, updateItemsCache } from '../../offline/items-cache.ts';
import { useWorkoutDraft } from '../../offline/use-workout-draft.ts';
import { type CacheFirstLoad, cacheFirstNotice } from '../../offline/cache-first.ts';
import { LoadoutPanel } from '../profile/LoadoutPanel.tsx';
import { useLoadout } from '../profile/use-loadout.ts';
import { announceDataChange } from '../../lib/data-changes.ts';
import { itemsQuery } from '../../lib/queries.ts';
import { loadedState } from '../../lib/query-state-rules.ts';
import { recallLastSummary } from '../summary/last-summary.ts';
import { challengeStartNoticeText } from '../workout/workout-rules.ts';
import { CollectionTabs } from './CollectionScreen.tsx';
import { CollectionHeading } from './CollectionHeading.tsx';

interface ChallengeStartProps {
  challenge: CatalogChallenge;
  challengeExercises: readonly ChallengeExerciseEntry[];
  strength: StrengthState | null;
  draftOpen: boolean | null;
  onStart: (challenge: CatalogChallenge) => Promise<void>;
}

function ChallengeStart({ challenge, challengeExercises, strength, draftOpen, onStart }: ChallengeStartProps) {
  const [starting, setStarting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const { unitPref } = usePreferences();
  const names = new Map(challengeExercises.map((exercise) => [exercise.id, exercise.name]));
  const namesWithoutE1rm =
    strength === null
      ? []
      : exercisesWithoutE1rm(challenge.definition, strength).map((exerciseId) => names.get(exerciseId) ?? 'Exercise');
  const start = async () => {
    setStarting(true);
    setProblem(null);
    try {
      await onStart(challenge);
    } catch (error) {
      setProblem(`Couldn't start the challenge: ${messageOf(error, 'try again.')}`);
    } finally {
      setStarting(false);
    }
  };
  return (
    <div className="well stack">
      <span className="muted tiny">Challenge: {challenge.name}</span>
      <span>
        {challengeSummaryText(challenge.definition, (exerciseId) => names.get(exerciseId) ?? 'Exercise', unitPref)}
      </span>
      {draftOpen && (
        <p className="notice" role="status">
          Finish or discard your current workout first
        </p>
      )}
      {namesWithoutE1rm.length > 0 && (
        <p className="notice" role="status">
          {missingE1rmText(namesWithoutE1rm)}
        </p>
      )}
      <button
        className="button primary"
        type="button"
        disabled={draftOpen !== false || starting || namesWithoutE1rm.length > 0}
        onClick={() => void start()}
      >
        Start challenge
      </button>
      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}

interface ItemDetailProps {
  item: CatalogItem;
  catalog: ItemCatalog;
  held: ReadonlyMap<string, HeldItem>;
  challengeExercises: readonly ChallengeExerciseEntry[];
  strength: StrengthState | null;
  equipped: boolean | null;
  offline: boolean;
  draftOpen: boolean | null;
  onCrafted: (outputItemId: string) => Promise<void>;
  onCatalogStale: () => Promise<void>;
  onLoadoutChanged: () => Promise<void>;
  onStartChallenge: (challenge: CatalogChallenge) => Promise<void>;
}

function ItemDetail({
  item,
  catalog,
  held,
  challengeExercises,
  strength,
  equipped,
  offline,
  draftOpen,
  onCrafted,
  onCatalogStale,
  onLoadoutChanged,
  onStartChallenge,
}: ItemDetailProps) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const nameOf = itemNameLookup(catalog.items, 'Unknown item');
  const recipe = recipeFor(item.id, catalog.recipes, tiersOf(catalog.items));
  const inventory = quantities(held);
  const ready = recipe !== undefined && canCraft(recipe, inventory);
  const quantity = held.get(item.id)?.quantity ?? 0;
  const challenge =
    item.kind === 'scroll'
      ? catalog.challenges.find((candidate) => candidate.id === item.grantsChallengeId)
      : undefined;

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

  const changeGear = async () => {
    if (!item.gearSlot) return;
    setBusy(true);
    setProblem(null);
    try {
      if (equipped) await unequipGear(item.gearSlot);
      else await equipGear(item.gearSlot, item.id);
    } catch (error) {
      setProblem(`Couldn't change your gear: ${messageOf(error, 'try again.')}`);
    }
    await onLoadoutChanged();
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
        {item.kind === 'scroll' && !challenge && <span className="muted">Grants a challenge</span>}
      </span>
      {challenge && quantity >= 1 && (
        <ChallengeStart
          challenge={challenge}
          challengeExercises={challengeExercises}
          strength={strength}
          draftOpen={draftOpen}
          onStart={onStartChallenge}
        />
      )}
      {item.gearSlot && quantity >= 1 && equipped !== null && (
        <button className="button" type="button" disabled={busy || offline} onClick={() => void changeGear()}>
          {equipped ? 'Unequip' : 'Equip'}
        </button>
      )}
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
            disabled={!ready || busy || offline}
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
  const items = useQuery(itemsQuery(userId));
  const [startNotice, setStartNotice] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [refetchProblem, setRefetchProblem] = useState<string | null>(null);
  const [newIds] = useState(() => newItemIds(recallLastSummary(userId)?.drops));
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { unitPref } = usePreferences();
  const { state: draftState, startWorkout, flush } = useWorkoutDraft(userId);
  const draftOpen = draftState.status === 'ready' ? draftState.draft !== null : null;
  const loadout = useLoadout(userId);
  const announceGearChanged = () => announceDataChange(queryClient, 'gear-changed');

  const showLoaded = (change: (loaded: LoadedItems) => LoadedItems) => {
    const { queryKey } = itemsQuery(userId);
    void queryClient.cancelQueries({ queryKey });
    queryClient.setQueryData<CacheFirstLoad<LoadedItems>>(
      queryKey,
      (current) => current && { ...current, loaded: change(current.loaded) },
    );
  };

  const refetchInventory = async () => {
    try {
      const held = await fetchInventory(userId);
      updateItemsCache(deviceStorage(), userId, (cache) => ({ ...cache, inventory: [...held.values()] }));
      showLoaded((loaded) => ({ ...loaded, held }));
      setRefetchProblem(null);
    } catch (error) {
      setRefetchProblem((error as Error).message);
    }
  };

  const refetchCatalog = async () => {
    try {
      const catalog = await fetchItemCatalog();
      updateItemsCache(deviceStorage(), userId, (cache) => ({ ...cache, catalog }));
      showLoaded((loaded) => ({ ...loaded, catalog }));
      setRefetchProblem(null);
    } catch (error) {
      setRefetchProblem((error as Error).message);
    }
  };

  const state = loadedState(items.data, items.isFetching ? null : items.error);
  const loaded = state.status === 'ready' ? state.data.loaded : null;
  const catalog = loaded?.catalog ?? null;
  const held = loaded?.held ?? new Map<string, HeldItem>();
  const challengeExercises = loaded?.challengeExercises ?? [];
  const strength = loaded?.strength ?? null;
  const offline = state.status === 'ready' && state.data.fromCache && state.data.offline;
  const savedNotice = state.status === 'ready' ? cacheFirstNotice(state.data, OFFLINE_ITEMS_NOTICE) : null;
  const loadProblem = refetchProblem ?? (state.status === 'failed' ? state.problem : null);
  const shownPickedId = pickedId ?? (catalog ? firstPickedItemId(catalog.items, held, newIds) : null);

  const startChallenge = async (challenge: CatalogChallenge) => {
    const started = startDraftFromChallenge(
      challenge,
      new Map(challengeExercises.map((exercise) => [exercise.id, exercise])),
      strength ?? {},
      DEFAULT_ROUNDING[unitPref],
      unitPref,
      new Date(),
    );
    const outcome = await startWorkout(() => started.draft);
    await flush();
    const notice = challengeStartNoticeText(outcome);
    if (notice) setStartNotice(notice);
    else navigate('/');
  };

  const header = (
    <>
      <CollectionHeading tab="Items" />
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
  const picked = catalog.items.find((item) => item.id === shownPickedId && held.has(item.id));

  return (
    <main className="screen stack">
      {header}
      {startNotice && (
        <p className="notice" role="status">
          {startNotice}
        </p>
      )}
      {savedNotice && (
        <p className="notice" role="status">
          {savedNotice}
        </p>
      )}
      <LoadoutPanel userId={userId} />
      {groups.map((group) => (
        <div className="panel stack" key={group.title}>
          <div className="row spread">
            <h2>{group.title}</h2>
            <span className="muted">
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
          challengeExercises={challengeExercises}
          strength={strength}
          equipped={loadout.data ? loadout.data.slots.some((equippedGear) => equippedGear.itemId === picked.id) : null}
          offline={offline}
          draftOpen={draftOpen}
          onCrafted={async (itemId) => {
            await Promise.all([refetchInventory(), announceGearChanged()]);
            setPickedId(itemId);
          }}
          onCatalogStale={refetchCatalog}
          onLoadoutChanged={announceGearChanged}
          onStartChallenge={startChallenge}
        />
      ) : (
        <EmptyState
          text="Hard sets can drop items. Finish a workout to find your first one."
          startLabel="Start a workout"
        />
      )}
    </main>
  );
}
