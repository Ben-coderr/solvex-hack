'use client';
import { useEffect, useState } from 'react';

/** Ticking clock for ages/countdowns. Pass `fixed` (styleguide, tests) to freeze it. */
export function useNow(intervalMs = 1000, fixed?: Date | number): number {
  const [now, setNow] = useState(() => (fixed === undefined ? Date.now() : +fixed));
  useEffect(() => {
    if (fixed !== undefined) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, fixed]);
  return fixed === undefined ? now : +fixed;
}
