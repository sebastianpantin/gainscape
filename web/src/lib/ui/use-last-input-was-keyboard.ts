import { useEffect, useRef } from 'react';

export function useLastInputWasKeyboard() {
  const keyboard = useRef(false);
  useEffect(() => {
    const fromKeyboard = () => (keyboard.current = true);
    const fromPointer = () => (keyboard.current = false);
    document.addEventListener('keydown', fromKeyboard, true);
    document.addEventListener('pointerdown', fromPointer, true);
    return () => {
      document.removeEventListener('keydown', fromKeyboard, true);
      document.removeEventListener('pointerdown', fromPointer, true);
    };
  }, []);
  return keyboard;
}
