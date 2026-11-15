import type { DropSummary } from '@domain/types.ts';
import { type AnimationEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ItemIcon, LootChestIcon, OpenLootChestIcon } from '../../components/PixelArt.tsx';
import { type CatalogItem, colorFor } from '../../lib/collection/item-rules.ts';
import { celebrate, FANFARE_CELEBRATIONS, primeCelebrationAudio } from '../../lib/platform/celebration-effects.ts';
import { prefersReducedMotion } from '../../lib/platform/device-effects.ts';
import { GLOSSARY } from '../../lib/ui/glossary.ts';
import { type LootSequence, lootSequence, type LootStep } from './loot-rules.ts';

const LEGENDARY_GLOW_AFTER_POP_S = 0.35;
const PET_ICON_SIZE = 72;

export type LoadedItems = CatalogItem[] | 'loading' | 'failed';

type LootPhase = 'closed' | 'opening' | 'shown';

function landingDelay(step: LootStep): string {
  const glows = step.item?.rarity === 'legendary';
  return glows ? `${step.landsAtS}s, ${step.landsAtS + LEGENDARY_GLOW_AFTER_POP_S}s` : `${step.landsAtS}s`;
}

function PrMark({ drop }: { drop: DropSummary }) {
  if (drop.source !== 'pr') return null;
  return (
    <span className="accent-text tiny" role="img" aria-label={GLOSSARY.pr.name}>
      PR
    </span>
  );
}

function followLanding(event: AnimationEvent<HTMLLIElement>) {
  if (event.animationName !== 'pop' || event.target !== event.currentTarget) return;
  event.currentTarget.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function LootDrop({ step }: { step: LootStep }) {
  const { drop, item, beat } = step;
  const color = item ? colorFor(item) : colorFor({ tier: null });
  const rarityClass = item ? ` rarity-${item.rarity}` : '';
  if (beat === 'pet' && item) {
    return (
      <li
        className={`loot-drop loot-pet${rarityClass}`}
        style={{ animationDelay: landingDelay(step) }}
        onAnimationStart={followLanding}
      >
        <ItemIcon kind={item.icon} color={color} size={PET_ICON_SIZE} />
        <span className="loot-pet-text">
          <span className="loot-pet-kicker">New pet!</span>
          <span className="loot-pet-name">{item.name}</span>
          <span className="muted tiny">{item.description}</span>
        </span>
        <PrMark drop={drop} />
      </li>
    );
  }
  return (
    <li
      className={`loot-drop beat-${beat}${rarityClass}`}
      style={{ animationDelay: landingDelay(step) }}
      onAnimationStart={followLanding}
    >
      <ItemIcon kind={item?.icon ?? 'scraps'} color={color} />
      <span style={{ flex: 1 }}>{item?.name ?? 'Unknown item'}</span>
      <span className="pixel">×{drop.quantity}</span>
      <PrMark drop={drop} />
    </li>
  );
}

function LootDrops({
  sequence,
  items,
  settled,
}: {
  sequence: LootSequence | null;
  items: LoadedItems;
  settled: boolean;
}) {
  if (items === 'loading') return <p className="muted">Loading loot…</p>;
  if (items === 'failed' || sequence === null)
    return <p className="muted">Couldn't load the loot names. See items for what dropped.</p>;
  return (
    <ul className={settled ? 'record-list loot-list settled' : 'record-list loot-list'} aria-label="Loot drops">
      {sequence.steps.map((step) => (
        <LootDrop key={step.drop.dropId} step={step} />
      ))}
    </ul>
  );
}

function useLootPlayback(userId: string, sequence: LootSequence | null) {
  const [phase, setPhase] = useState<LootPhase>('closed');
  const fanfareFired = useRef(false);
  const fanfare = sequence?.fanfare ?? null;
  const endS = sequence?.endS ?? 0;

  const playFanfare = useCallback(() => {
    if (fanfare === null || fanfareFired.current) return;
    fanfareFired.current = true;
    celebrate(userId, FANFARE_CELEBRATIONS[fanfare.kind]);
  }, [fanfare, userId]);

  const showAll = useCallback(() => {
    playFanfare();
    setPhase('shown');
  }, [playFanfare]);

  useEffect(() => {
    if (phase !== 'opening') return;
    const timers = [setTimeout(() => setPhase('shown'), endS * 1000)];
    if (fanfare) timers.push(setTimeout(playFanfare, fanfare.atS * 1000));
    const skipOnKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') showAll();
    };
    const listening = setTimeout(() => {
      document.addEventListener('click', showAll);
      document.addEventListener('keydown', skipOnKey);
    }, 0);
    return () => {
      for (const timer of timers) clearTimeout(timer);
      clearTimeout(listening);
      document.removeEventListener('click', showAll);
      document.removeEventListener('keydown', skipOnKey);
    };
  }, [phase, endS, fanfare, playFanfare, showAll]);

  const open = () => {
    primeCelebrationAudio(userId);
    if (prefersReducedMotion()) showAll();
    else setPhase('opening');
  };

  return { phase, open };
}

interface LootPanelProps {
  userId: string;
  drops: readonly DropSummary[];
  items: LoadedItems;
  delayS: number;
}

export function LootPanel({ userId, drops, items, delayS }: LootPanelProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const sequence = Array.isArray(items) ? lootSequence(drops, items) : null;
  const { phase, open } = useLootPlayback(userId, sequence);
  const hasDrops = drops.length > 0;
  const opened = phase !== 'closed';
  const fanfare = opened ? (sequence?.fanfare ?? null) : null;

  const openLoot = () => {
    open();
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };

  return (
    <section
      className={fanfare ? `panel stack loot-${fanfare.kind}` : 'panel stack rise'}
      aria-label="Loot"
      style={{ animationDelay: fanfare ? `${fanfare.atS}s` : `${delayS}s` }}
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
      {hasDrops && !opened && (
        <button type="button" className="loot-chest" onClick={openLoot}>
          <span className="loot-chest-art">
            <LootChestIcon />
          </span>
          Open loot
        </button>
      )}
      {opened && (
        <span className="loot-chest-open" aria-hidden="true">
          <OpenLootChestIcon />
        </span>
      )}
      {hasDrops && (
        <div role="status">{opened && <LootDrops sequence={sequence} items={items} settled={phase === 'shown'} />}</div>
      )}
    </section>
  );
}
