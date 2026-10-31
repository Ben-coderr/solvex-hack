'use client';
import type { IngestAck } from '@sellekni/api-contract';
import { ClipboardPaste, FlaskConical } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, fieldCls } from '@/components/ui/dialog';
import { useIngest } from '@/lib/dispatch';
import { cn } from '@/lib/utils';

/** Must match SCENARIOS in server/services/demo.ts (the canonical packets of docs/05). */
const SCENARIOS = ['rollover', 'frontal', 'witness_near_rollover', 'witness_oran', 'bad_crc'] as const;

function AckLine({ ack, onOpen }: { ack: IngestAck; onOpen: (id: string) => void }) {
  const t = useTranslations('paste.result');
  const text =
    ack.outcome === 'unparsed' ? t('unparsed', { error: ack.error ?? '?' })
    : ack.outcome === 'duplicate' ? t('duplicate')
    : t(ack.outcome as 'created', { id: ack.incident_id ?? '' });
  return (
    <p role="status" data-testid="ingest-result" data-outcome={ack.outcome}
      className={cn('flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-base', ack.outcome === 'unparsed' ? 'border-status-warn text-status-warn' : 'border-line')}>
      {text}
      {ack.incident_id && ack.outcome !== 'unparsed' && (
        <Button variant="link" size="sm" className="h-auto p-0" onClick={() => onOpen(ack.incident_id!)}>{t('open')}</Button>
      )}
    </p>
  );
}

/** D6 "Paste SMS" + (DEMO only) "Simulate SMS": both go through the real ingest path; a parse failure is kept and shown raw. */
export function IngestButtons({ demo, onOpenIncident }: { demo: boolean; onOpenIncident: (id: string) => void }) {
  const t = useTranslations();
  const [open, setOpen] = useState<'paste' | 'sim' | null>(null);
  const [text, setText] = useState('');
  const [scenario, setScenario] = useState<(typeof SCENARIOS)[number]>('rollover');
  const ingest = useIngest();
  const id = useId();

  const close = (o: boolean) => {
    if (o) return;
    setOpen(null);
    ingest.reset();
  };
  const go = (incident: string) => {
    close(false);
    onOpenIncident(incident);
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen('paste')} data-testid="open-paste">
        <ClipboardPaste aria-hidden />
        {t('paste.open')}
      </Button>
      {demo && (
        <Button variant="outline" size="sm" onClick={() => setOpen('sim')} data-testid="open-sim">
          <FlaskConical aria-hidden />
          {t('sim.open')}
        </Button>
      )}

      <Dialog open={open === 'paste'} onOpenChange={close} title={t('paste.title')} description={t('paste.hint')}>
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); if (text.trim()) ingest.mutate({ kind: 'paste', text }); }}>
          <label htmlFor={id} className="text-base font-medium">{t('paste.label')}</label>
          <textarea id={id} dir="ltr" rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000}
            placeholder="SLK1 K7Q2M R75H 36.47213,2.82871 …" className={cn(fieldCls, 'font-mono')} />
          {ingest.data && <AckLine ack={ingest.data} onOpen={go} />}
          {ingest.error && <p role="alert" className="text-sm text-status-danger">{ingest.error.message}</p>}
          <div className="flex justify-end">
            <Button type="submit" disabled={!text.trim() || ingest.isPending}>{t('paste.send')}</Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={open === 'sim'} onOpenChange={close} title={t('sim.title')} description={t('sim.hint')}>
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); ingest.mutate({ kind: 'sim', scenario }); }}>
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="sr-only">{t('sim.title')}</legend>
            {SCENARIOS.map((s) => (
              <label key={s} className={cn('flex min-h-12 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-base',
                scenario === s ? 'border-brand-fill bg-raised' : 'border-line')}>
                <input type="radio" name="scenario" value={s} checked={scenario === s} onChange={() => setScenario(s)} className="size-5 accent-[var(--sellekni-brand-fill)]" />
                {t(`sim.${s}`)}
              </label>
            ))}
          </fieldset>
          {ingest.data && <AckLine ack={ingest.data} onOpen={go} />}
          {ingest.error && <p role="alert" className="text-sm text-status-danger">{ingest.error.message}</p>}
          <div className="flex justify-end">
            <Button type="submit" disabled={ingest.isPending} data-testid="sim-send">{t('sim.send')}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
