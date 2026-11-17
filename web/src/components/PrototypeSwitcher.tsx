import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

interface PrototypeSwitcherProps {
  variants: { key: string; name: string }[];
}

export function usePrototypeVariant(keys: string[]): string {
  const [params] = useSearchParams();
  const wanted = params.get('variant') ?? keys[0];
  return keys.includes(wanted) ? wanted : keys[0];
}

export function PrototypeSwitcher({ variants }: PrototypeSwitcherProps) {
  const [params, setParams] = useSearchParams();
  const keys = variants.map((variant) => variant.key);
  const current = usePrototypeVariant(keys);
  const index = keys.indexOf(current);
  const go = (step: number) => {
    const next = keys[(index + step + keys.length) % keys.length];
    const updated = new URLSearchParams(params);
    updated.set('variant', next);
    setParams(updated, { replace: true });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && target.closest('input, textarea, select, [contenteditable]') !== null) return;
      if (event.key === 'ArrowLeft') go(-1);
      if (event.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!import.meta.env.DEV) return null;
  const name = variants[index]?.name ?? '';
  return (
    <div className="prototype-switcher" role="toolbar" aria-label="Prototype variants">
      <button type="button" onClick={() => go(-1)} aria-label="Previous variant">
        ‹
      </button>
      <span>
        {current} ({name})
      </span>
      <button type="button" onClick={() => go(1)} aria-label="Next variant">
        ›
      </button>
    </div>
  );
}
