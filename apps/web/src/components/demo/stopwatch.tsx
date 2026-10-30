'use client';
import { Flag, Pause, Play, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface StopwatchState { startedAt: number | null; accumulated: number; laps: number[] }

const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.${Math.floor((ms % 1000) / 100)}`;
};

/** Shared by the console and the phones page: a scenario button starts it, so the clock runs from the first tap. */
export function useStopwatch() {
  const [s, set] = useState<StopwatchState>({ startedAt: null, accumulated: 0, laps: [] });
  const elapsed = (now: number) => s.accumulated + (s.startedAt ? now - s.startedAt : 0);
  const start = useCallback(() => set((p) => (p.startedAt ? p : { ...p, startedAt: Date.now() })), []);
  const stop = useCallback(() => set((p) => (p.startedAt ? { ...p, accumulated: p.accumulated + Date.now() - p.startedAt, startedAt: null } : p)), []);
  const lap = useCallback(() => set((p) => ({ ...p, laps: [...p.laps, p.accumulated + (p.startedAt ? Date.now() - p.startedAt : 0)] })), []);
  const clear = useCallback(() => set({ startedAt: null, accumulated: 0, laps: [] }), []);
  return { state: s, elapsed, start, stop, lap, clear, running: s.startedAt !== null };
}

/** D11: a visible stopwatch for the latency measurements (docs/10 §5). Space toggles it. */
export function Stopwatch({ sw, compact }: { sw: ReturnType<typeof useStopwatch>; compact?: boolean }) {
  const t = useTranslations('demo');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!sw.running) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [sw.running]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.code !== 'Space' || el.closest('input, textarea, button, select, [contenteditable]')) return;
      e.preventDefault();
      if (sw.running) sw.stop();
      else sw.start();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sw]);

  const shown = sw.running ? sw.elapsed(now) : sw.state.accumulated;
  return (
    <section aria-label={t('stopwatch')} className={cn('flex flex-col gap-3 rounded-md border border-line bg-surface p-4', compact && 'p-3')}>
      <div className="flex flex-wrap items-center gap-3">
        <span role="timer" aria-live="off" data-testid="stopwatch" data-running={sw.running}
          className={cn('packet-ltr font-display font-semibold tabular-nums', compact ? 'text-4xl' : 'text-7xl', sw.running && 'text-brand-text')}>
          {fmt(shown)}
        </span>
        <div className="flex flex-wrap gap-2">
          {sw.running ? (
            <Button variant="outline" onClick={sw.stop}><Pause aria-hidden />{t('stop')}</Button>
          ) : (
            <Button variant="outline" onClick={sw.start}><Play aria-hidden className="rtl:-scale-x-100" />{t('start')}</Button>
          )}
          <Button variant="outline" onClick={sw.lap} disabled={shown === 0}><Flag aria-hidden />{t('lap')}</Button>
          <Button variant="ghost" onClick={sw.clear} disabled={shown === 0 && sw.state.laps.length === 0}><RotateCcw aria-hidden />{t('clear')}</Button>
        </div>
      </div>
      {sw.state.laps.length > 0 && (
        <ol aria-label={t('laps')} className="packet-ltr flex flex-wrap gap-x-4 gap-y-1 font-mono text-base text-muted-foreground">
          {sw.state.laps.map((l, i) => <li key={i}>#{i + 1} {fmt(l)}</li>)}
        </ol>
      )}
      {!compact && <p className="text-sm text-muted-foreground">{t('spaceHint')}</p>}
    </section>
  );
}
