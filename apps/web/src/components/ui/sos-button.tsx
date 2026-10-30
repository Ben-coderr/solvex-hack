'use client';
import { Check, Loader } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { ringDash } from '@sellekni/ui-core';
import { cn } from '@/lib/utils';

export type SosState = 'idle' | 'sending' | 'sent';

export interface SosButtonProps {
  state?: SosState;
  onConfirm?: () => void;
  holdMs?: number;
  /** styleguide only: freeze the hold progress (0..1) */
  previewProgress?: number;
  className?: string;
}

/**
 * Hold-to-confirm SOS (docs/03 M7): 1.5 s hold, ring fills, release early = nothing happens.
 * Brand fill, never triage red. Works with pointer and keyboard (hold Space/Enter).
 */
export function SosButton({ state = 'idle', onConfirm, holdMs = 1500, previewProgress, className }: SosButtonProps) {
  const t = useTranslations('sos');
  const [progress, setProgress] = useState(0);
  const start = useRef<number | null>(null);
  const raf = useRef<number | null>(null);

  const stop = () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    start.current = null;
    setProgress(0);
  };
  const tick = (now: number) => {
    if (start.current === null) start.current = now;
    const p = Math.min(1, (now - start.current) / holdMs);
    setProgress(p);
    if (p >= 1) {
      stop();
      onConfirm?.();
      return;
    }
    raf.current = requestAnimationFrame(tick);
  };
  const begin = () => {
    if (state !== 'idle' || raf.current) return;
    raf.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);

  const p = previewProgress ?? progress;
  const holding = p > 0 && state === 'idle';
  const { circumference, offset } = ringDash(46, p);
  const label = state === 'sending' ? t('sending') : state === 'sent' ? t('sent') : holding ? t('pressed') : t('idle');

  return (
    <button
      type="button"
      disabled={state !== 'idle'}
      onPointerDown={begin}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); begin(); } }}
      onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') stop(); }}
      className={cn(
        'relative grid size-32 shrink-0 touch-none select-none place-items-center rounded-full',
        'bg-brand-fill text-on-brand disabled:cursor-default',
        state === 'sent' && 'bg-raised text-text outline-2 outline-status-ok',
        className,
      )}
    >
      <svg viewBox="0 0 100 100" aria-hidden className="absolute inset-0 -rotate-90">
        <circle cx="50" cy="50" r="46" fill="none" stroke="var(--sellekni-on-brand)" strokeOpacity={holding ? 0.25 : 0} strokeWidth="6" />
        <circle cx="50" cy="50" r="46" fill="none" stroke="var(--sellekni-on-brand)" strokeWidth="6" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset} opacity={holding ? 1 : 0} />
      </svg>
      <span className="relative flex flex-col items-center gap-0.5">
        {state === 'sending' ? <Loader aria-hidden className="size-8 animate-spin motion-reduce:animate-none" />
          : state === 'sent' ? <Check aria-hidden className="size-8 text-status-ok" />
          : <span className="font-display text-3xl font-bold leading-none tracking-wide">SOS</span>}
        {/* accessible name = the visible words (WCAG 2.5.3 label-in-name) */}
        <span className="max-w-24 text-center text-xs leading-tight">{state === 'idle' && !holding ? t('hint') : label}</span>
      </span>
    </button>
  );
}
