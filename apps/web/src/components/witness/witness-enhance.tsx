'use client';
import { WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * Progressive enhancement for the witness and crew forms (the form works without it): an offline notice that blocks
 * a send that cannot leave, and a double-submit guard. Old browsers that do not run this still post the plain form.
 */
export function WitnessEnhance({ offline, sending, formId = 'witness-form', testId = 'witness-offline' }: {
  offline: string; sending: string; formId?: string; testId?: string;
}) {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    const form = document.getElementById(formId) as HTMLFormElement | null;
    const onSubmit = (e: SubmitEvent) => {
      if (!navigator.onLine) {
        e.preventDefault();
        setOnline(false);
        return;
      }
      const button = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (button) {
        button.disabled = true;
        button.lastChild!.textContent = sending;
      }
    };
    form?.addEventListener('submit', onSubmit);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
      form?.removeEventListener('submit', onSubmit);
    };
  }, [sending, formId]);

  if (online) return null;
  return (
    <div role="alert" data-testid={testId} className="flex items-start gap-3 rounded-md border-2 border-status-warn bg-surface p-4 text-lg">
      <WifiOff aria-hidden className="mt-0.5 size-6 shrink-0 text-status-warn" />
      {offline}
    </div>
  );
}
