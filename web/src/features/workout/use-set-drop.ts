import { useEffect, useRef, useState } from 'react';
import { type SetDrop, type ShownSetDrop, XP_DROP_MS } from './set-feedback-rules.ts';

export function useSetDrop() {
  const [drop, setDrop] = useState<ShownSetDrop | null>(null);
  const [announcement, setAnnouncement] = useState<{ text: string; key: number } | null>(null);
  const dropCount = useRef(0);

  useEffect(() => {
    if (drop === null) return;
    const timer = setTimeout(() => setDrop(null), XP_DROP_MS);
    return () => clearTimeout(timer);
  }, [drop]);

  const showDrop = (shown: SetDrop, setId: string) => {
    dropCount.current += 1;
    setDrop({ ...shown, setId, key: dropCount.current });
    setAnnouncement({ text: shown.announcement, key: dropCount.current });
  };
  const dropOn = (setId: string) => (drop?.setId === setId ? drop : null);

  return { announcement, showDrop, dropOn };
}
